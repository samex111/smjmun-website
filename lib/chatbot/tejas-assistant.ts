import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { Groq } from "groq-sdk";
import OpenAI from "openai";
import { SiteSettingsService } from "@/lib/sanity/siteSettings/service";
import { ConferenceService } from "@/lib/sanity/conference/service";
import { BlogService } from "@/lib/sanity/blog/service";
import { FAQService } from "@/lib/sanity/faq/service";
import { getAllPrograms } from "@/data/programs";
import { db } from "@/lib/db";
import { CONVERSATION_STYLE_GUIDE } from "@/lib/chatbot/v2/prompts/system";
import { createSupportCase } from "@/lib/support/service";

type Channel = "website" | "whatsapp";
type Actor = { channel: Channel; sessionId: string; phone?: string; verifiedRegistrationId?: string };
type ToolResult = { ok: boolean; data?: unknown; error?: string };

const searchSchema = z.object({ query: z.string().trim().min(2).max(500) });
const paymentSchema = z.object({ registrationId: z.string().trim().optional() });
const escalationSchema = z.object({
  reason: z.string().trim().min(3).max(180),
  requestedAction: z.string().trim().min(3).max(500),
  summary: z.string().trim().min(10).max(2000),
  urgency: z.enum(["normal", "high", "critical"]).default("normal"),
});

function portableTextToString(value: unknown): string {
  if (!Array.isArray(value)) return typeof value === "string" ? value : "";
  return value.map((block: any) => (block.children || []).map((child: any) => child.text || "").join(" ")).join("\n");
}

function flatten(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flatten).join("\n");
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !["gallery", "heroImage", "image", "coverImage", "videoSrc", "imageSrc"].includes(key))
    .map(([key, entry]) => `${key}: ${flatten(entry)}`).join("\n");
  return value == null ? "" : String(value);
}

async function searchPublicKnowledge(query: string) {
  const [settings, conferences, blogs, faqs] = await Promise.all([
    SiteSettingsService.getSiteSettings(),
    ConferenceService.getConferencesForSearch(),
    BlogService.getBlogPosts(),
    FAQService.getFAQs(),
  ]);
  const programs = getAllPrograms();
  const corpus: Array<{ type: string; title: string; text: string; url?: string }> = [];
  if (settings) corpus.push({
    type: "organization", title: settings.organizationName || "SMJMUN",
    text: flatten({ ...settings, whyJoinSMJMUN: portableTextToString(settings.whyJoinSMJMUN) }),
  });
  for (const program of programs) corpus.push({
    type: "program", title: program.meta.title,
    text: flatten({ meta: program.meta, intro: program.intro, sections: program.sections, timeline: program.timeline, benefits: program.benefits, faq: program.faq, cta: program.cta }),
    url: `/programs/${program.slug}`,
  });
  for (const conference of conferences) corpus.push({
    type: "conference", title: conference.title,
    text: flatten({ ...conference, overview: portableTextToString(conference.overview), agenda: portableTextToString(conference.agenda), eligibilityRichText: portableTextToString(conference.eligibilityRichText) }),
    url: `/conferences/${conference.slug?.current || ""}`,
  });
  for (const blog of blogs) corpus.push({
    type: "blog", title: blog.title,
    text: [blog.excerpt, ...(blog.tags || [])].filter(Boolean).join("\n"),
    url: `/blogs/${blog.slug.current}`,
  });
  for (const faq of faqs) corpus.push({
    type: "faq", title: faq.question,
    text: portableTextToString(faq.answer),
  });

  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2);
  const scored = corpus.map(item => {
    const haystack = `${item.title} ${item.text}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? (item.title.toLowerCase().includes(term) ? 3 : 1) : 0), 0);
    return { ...item, score };
  }).filter(item => item.score > 0).sort((a,b) => b.score-a.score).slice(0, 8);
  return scored.map(({type,title,text,url}) => ({type,title,text:text.slice(0,7000),url}));
}

async function getPaymentDetails(actor: Actor, registrationId?: string) {
  if (!actor.verifiedRegistrationId && !actor.phone) {
    return { ok:false, error:"The delegate must verify their identity before private registration or payment information can be shared." };
  }
  const registration = registrationId
    ? await db.registration.findUnique({ where:{ id:registrationId } })
    : await db.registration.findUnique({ where:{ id:actor.verifiedRegistrationId! } });
  if (!registration) return {ok:false,error:"No matching registration was found."};
  if (!actor.verifiedRegistrationId || registration.id !== actor.verifiedRegistrationId) {
    return {ok:false,error:"This registration is not linked to the verified conversation. Ask the delegate to link and verify this registration."};
  }
  return {ok:true,data:{
    registrationId:registration.id,
    name:`${registration.firstName} ${registration.lastName}`,
    email:registration.email,
    conference:registration.conferenceTitle,
    conferenceDate:registration.conferenceDate,
    status:registration.status,
    paymentStatus:registration.status === "PAID" ? "PAID" : registration.status,
    amount:registration.conferenceFee,
    currency:registration.currency,
    transactionId:registration.paymentId,
    paidAt:registration.paidAt,
    hdfcOrderId:registration.hdfcOrderId,
  }};
}

async function runTool(name: string, rawArgs: unknown, actor: Actor): Promise<ToolResult> {
  if (name === "search_smjmun_knowledge") {
    const args = searchSchema.parse(rawArgs);
    return {ok:true,data:await searchPublicKnowledge(args.query)};
  }
  if (name === "get_payment_details") {
    const args = paymentSchema.parse(rawArgs);
    return getPaymentDetails(actor,args.registrationId);
  }
  if (name === "escalate_to_human") {
    const args = escalationSchema.parse(rawArgs);
    const created = await createSupportCase({
      actor,
      reason:args.reason,
      requestedAction:args.requestedAction,
      summary:args.summary,
      urgency:args.urgency,
    });
    return {ok:true,data:created};
  }
  return {ok:false,error:"Unknown tool"};
}

async function callModel(messages: Array<{role:"system"|"user"|"assistant";content:string}>, tools:any[]): Promise<any> {
  if (process.env.GEMINI_API_KEY) {
    const client = new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
    const response = await client.models.generateContent({
      model:"gemini-2.5-flash",
      contents:messages.map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]})),
      config:{tools:[{functionDeclarations:tools.map(tool=>({
        name:tool.function.name,
        description:tool.function.description,
        parameters:tool.function.parameters,
      }))]},
    });
    return {provider:"gemini",parts:response.candidates?.[0]?.content?.parts || [],text:response.text || ""};
  }
  if (process.env.GROQ_API_KEY) {
    const client = new Groq({apiKey:process.env.GROQ_API_KEY});
    const response = await client.chat.completions.create({
      model:"llama-3.3-70b-versatile",
      messages:messages as any,
      tools,
      tool_choice:"auto",
      temperature:0.2,
    });
    return {provider:"groq",message:response.choices[0]?.message};
  }
  if (process.env.NVIDIA_API_KEY) {
    const client = new OpenAI({apiKey:process.env.NVIDIA_API_KEY,baseURL:"https://integrate.api.nvidia.com/v1"});
    const response = await client.chat.completions.create({
      model:"openai/gpt-oss-20b",
      messages:messages as any,
      tools,
      tool_choice:"auto",
      temperature:0.2,
    });
    return {provider:"openai",message:response.choices[0]?.message};
  }
  throw new Error("Configure GEMINI_API_KEY, GROQ_API_KEY, or NVIDIA_API_KEY.");
}

const toolDefinitions = [
  {type:"function",function:{name:"search_smjmun_knowledge",description:"Search authoritative public SMJMUN information: organization, founder, mission, published public policies/FAQs, programs, conferences, schedules, venue, logistics and published blog learning resources. Always use this before answering factual questions about SMJMUN.",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"]}}},
  {type:"function",function:{name:"get_payment_details",description:"Retrieve the verified delegate's own registration and payment details. Never use for payment verification or refunds. The application checks identity and returns only the linked registration.",parameters:{type:"object",properties:{registrationId:{type:"string"}},additionalProperties:false}}},
  {type:"function",function:{name:"escalate_to_human",description:"Create a human support handoff when a delegate explicitly asks for a person, raises a refund/transfer/complaint/exception, or needs an action the assistant cannot perform. Include a concise factual summary and requested action. This does not approve or execute a refund.",parameters:{type:"object",properties:{reason:{type:"string"},requestedAction:{type:"string"},summary:{type:"string"},urgency:{type:"string",enum:["normal","high","critical"]}},required:["reason","requestedAction","summary"]}}},
] as const;

export class TejasAssistantService {
  static async reply(input:{message:string;actor:Actor;history?:Array<{role:"user"|"assistant";content:string}>}) {
    const history=(input.history||[]).slice(-12);
    const messages:any[]=[
      {role:"system",content:`${CONVERSATION_STYLE_GUIDE}

You are Tejas AI, a single tool-calling assistant for SMJMUN, serving both anonymous website visitors and WhatsApp delegates.
Use the public knowledge tool before giving factual SMJMUN answers. Blogs are educational references, not policy authority. Never invent privacy, refund or cancellation policies.
Use payment tool only for the user's verified linked registration. Never claim to verify, charge, refund, cancel or transfer a payment. HDFC verification is deterministic application code, not an AI action.
For refunds, payment disputes, transfers, exceptions, complaints requiring judgement, or explicit human requests, call escalate_to_human. Do not ask the user to repeat known context. After successful escalation tell them the request is with the Secretariat, a human will reply in this same WhatsApp conversation, and avoid promising a fixed response time. If no operator is available, be transparent.
Never disclose registration or payment information to an unverified user.
Channel: ${input.actor.channel}. Identity verified: ${Boolean(input.actor.verifiedRegistrationId)}.`},
      ...history.map(m=>({role:m.role,content:m.content})),
      {role:"user",content:input.message},
    ];
    let finalText="";
    for(let turn=0;turn<4;turn++){
      const response=await callModel(messages,toolDefinitions as any);
      if(response.provider==="gemini"){
        const functionCalls=response.parts.filter((part:any)=>part.functionCall);
        if(!functionCalls.length){finalText=response.text || response.parts.map((p:any)=>p.text||"").join("");break;}
        const functionResponses=[];
        for(const part of functionCalls){
          const call=part.functionCall;
          let result:ToolResult;
          try { result=await runTool(call.name,call.args,input.actor); }
          catch(error){result={ok:false,error:error instanceof Error?error.message:"Tool failed"};}
          functionResponses.push({functionResponse:{name:call.name,response:result}});
        }
        messages.push({role:"model",parts:response.parts});
        messages.push({role:"user",parts:functionResponses});
      } else {
        const assistantMessage=response.message;
        const calls=assistantMessage?.tool_calls||[];
        if(!calls.length){finalText=assistantMessage?.content||"";break;}
        messages.push(assistantMessage);
        for(const call of calls){
          let result:ToolResult;
          try { result=await runTool(call.function.name,JSON.parse(call.function.arguments||"{}"),input.actor); }
          catch(error){result={ok:false,error:error instanceof Error?error.message:"Tool failed"};}
          messages.push({role:"tool",tool_call_id:call.id,content:JSON.stringify(result)});
        }
      }
    }
    if(!finalText) finalText="I’m having trouble completing that request right now. Please try again or ask for a Secretariat representative.";
    return {text:finalText};
  }
}
