import { QueryNormalizer } from "./pipeline/normalizer";
import { SemanticMapper } from "./pipeline/semantic-mapper";
import { FastMatcher } from "./pipeline/fast-matcher";
import { UnderstandingLayer } from "./pipeline/understanding";
import { ContextResolver } from "./core/context-resolver";
import { ExecutionPlanner } from "./core/execution-planner";
import { EntityResolver } from "./core/entity-resolver";
import { ConferenceService } from "./services/conference";
import { ResponseComposer } from "./responses/composer";
import { TemplateEngine } from "./responses/templates";
import { ClarificationEngine } from "./responses/clarification";
import { LLMGenerator } from "./services/llm-generator";
import { SiteSettingsService } from "../../sanity/siteSettings/service";
import { CONVERSATION_STYLE_GUIDE } from "./prompts/system";
import { AssistantResponse, ConversationState, Intent, Action, ExecutionStep, ExecutionPlan, Suggestion } from "./types";
import { ChatLogger } from "../utils/logger";

export class V2Engine {
  // Simple in-memory mock for now. In production, this would be Redis/DB.
  private static mockMemory: Record<string, ConversationState> = {};

  static async process(query: string, sessionId: string): Promise<AssistantResponse> {
    const requestId = `req-${Math.random().toString(36).substring(2, 9)}`;
    const logger = new ChatLogger(sessionId, requestId);
    logger.logIncoming(query);

    const state = this.mockMemory[sessionId] || { history: [] };

    // 1. Pipeline: Normalization & Understanding
    const t0 = performance.now();
    const normalized = QueryNormalizer.normalize(query);
    logger.logPipelineStage('QueryNormalizer', { normalized }, performance.now() - t0);

    const t1 = performance.now();
    const semantic = SemanticMapper.map(normalized);
    logger.logPipelineStage('SemanticMapper', { semantic }, performance.now() - t1);

    const t2 = performance.now();
    let parsedQuery = FastMatcher.match(query, normalized);
    logger.logPipelineStage('FastMatcher', { parsedQuery }, performance.now() - t2);
    
    if (!parsedQuery) {
      if (semantic?.source === "exact") {
        parsedQuery = {
          intent: (semantic.possibleIntent || Intent.CONFERENCE) as Intent,
          action: Action.GET,
          field: semantic.field,
          confidence: 1.0,
          rawQuery: query,
          normalizedQuery: normalized
        };
      } else {
        const t3 = performance.now();
        parsedQuery = await UnderstandingLayer.understand(query, normalized);
        logger.logPipelineStage('UnderstandingLayer', { parsedQuery }, performance.now() - t3);
      }
    }

    if (semantic) {
      if (semantic.field) {
        parsedQuery.field = semantic.field;
      }
      parsedQuery.semanticHints = semantic;
      
      // We don't force intent here anymore. Planner handles it!
    }

    // 1.5 Entity Resolution (Data-Driven)
    if (parsedQuery.entity && parsedQuery.intent === Intent.CONFERENCE) {
      const service = new ConferenceService();
      const candidates = await service.searchCandidates(parsedQuery.entity, logger);
      const resolution = EntityResolver.resolve({
        query: parsedQuery.entity,
        candidates,
        keys: [
          { path: "title", weight: 10 },
          { path: "city", weight: 8 },
          { path: "venue", weight: 10 },
          { path: "slug", weight: 5 },
          { path: "committees", weight: 5 }
        ]
      });

      if (resolution.confidence >= 0.90) {
        parsedQuery.entity = resolution.entity.title; // Canonical name
        // Store the resolved ID for getById later
        (parsedQuery as any).resolvedId = resolution.entity._id;
        logger.logPipelineStage('EntityResolver', { resolved: true, resolution });
      } else if (resolution.confidence >= 0.60) {
        logger.logPipelineStage('EntityResolver', { resolved: false, needsClarification: true, resolution });
        const res = ResponseComposer.compose(`Did you mean **${resolution.entity.title}**?`, "clarification", {
          service: "conference",
          chips: [{ label: "Yes", action: `Yes, ${resolution.entity.title}` }, { label: "No", action: "No" }]
        });
        logger.logResponse('clarification', res.text.length);
        return res;
      } else {
        logger.logPipelineStage('EntityResolver', { resolved: false, error: 'no match', resolution });
        const res = ResponseComposer.compose(`I couldn't find a conference matching "${parsedQuery.entity}".`, "error", { service: "conference", chips: [] });
        logger.logResponse('error', res.text.length);
        return res;
      }
    }

    // 2. Context Resolution & Planning
    const t4 = performance.now();
    const context = ContextResolver.resolve(parsedQuery, state);
    logger.logPipelineStage('ContextResolver', { context }, performance.now() - t4);

    const t5 = performance.now();
    const plan = ExecutionPlanner.plan(context);
    logger.logPipelineStage('ExecutionPlanner', { plan }, performance.now() - t5);

    // 3. Execution (Domain Services)
    let text = "I'm not sure how to answer that yet.";
    let domainData = null;
    let responseType: "answer" | "clarification" | "error" = "answer";
    let customChips: Suggestion[] = [];
    
    // Check Clarification first
    if (plan.requiresClarification) {
      const clarif = ClarificationEngine.ask(context);
      state.pendingClarification = true;
      this.mockMemory[sessionId] = state;
      logger.logResponse('clarification', clarif.text.length);
      return clarif;
    }

    if (context.query.intent === Intent.GREETING) {
      text = "👋 Welcome to **SMJMUN**!\n\nI'm Tejas AI by SMJMUN and I can help you with:\n* 🌍 What is Model United Nations?\n* 🏛 Learn about SMJMUN\n* 📅 Upcoming conferences\n* 📝 Registration & eligibility\n* 🏛 Committees & agendas\n* ❓ Frequently asked questions\n\nWhat would you like to explore?";
      customChips = [
        { label: "What is MUN?", action: "What is MUN?" },
        { label: "Upcoming Conferences", action: "Upcoming Conferences" },
        { label: "Register", action: "How to Register" },
        { label: "Beginner Guide", action: "Beginner Guide" }
      ];
      responseType = "answer";
    } else if (context.query.intent === Intent.CONTACT) {
      const settings = await SiteSettingsService.getSiteSettings();
      const email = settings?.contact?.email || "info@smjmun.com";
      const phone = settings?.contact?.phone || "+91 93019 14668";
      const whatsapp = settings?.contact?.whatsapp || "+91 93019 14668";
      
      text = `You can reach out to the SMJMUN Secretariat through any of the following channels:

* 📧 **Email**: [${email}](mailto:${email})
* 📞 **Phone**: ${phone}
* 💬 **WhatsApp**: [${whatsapp}](https://wa.me/${whatsapp.replace(/[^0-9]/g, '')})`;

      if (settings?.socialLinks?.instagram) {
         text += `\n* 📱 **Instagram**: [SMJMUN Instagram](${settings.socialLinks.instagram})`;
      }
      
      text += "\n\nWe're happy to help with any questions you might have!";
      responseType = "answer";
    } else if (plan.targetService === "conference") {
      const service = new ConferenceService();
      const resolvedId = (parsedQuery as any).resolvedId;
      
      let fullConference = null;
      if (resolvedId) {
        fullConference = await service.getById(resolvedId, logger);
        domainData = { data: [fullConference] };
      } else {
        // Fallback if no specific entity was resolved (e.g. LIST)
        const candidates = await service.searchCandidates("", logger);
        domainData = { data: candidates };
      }
      
      if (plan.steps.includes(ExecutionStep.OVERVIEW_TEMPLATE) && context.query.entity) {
        const tpl = TemplateEngine.overview(context.query.entity, domainData as any);
        if (tpl) {
          text = tpl;
        } else {
          text = `I couldn't generate an overview for ${context.query.entity}.`;
        }
      } else if (plan.steps.includes(ExecutionStep.TEMPLATE_RESPONSE) && context.query.entity && context.query.field) {
        const tpl = TemplateEngine.apply(context.query.entity, context.query.field, domainData as any);
        if (tpl) {
          text = tpl;
        } else {
          text = `I couldn't find the ${context.query.field} for ${context.query.entity}.`;
        }
      } else if (plan.steps.includes(ExecutionStep.LLM_GENERATOR)) {
        const prompt = `${CONVERSATION_STYLE_GUIDE}

---

Use the following context to answer the user's question.
Context: ${JSON.stringify(domainData.data)}

User Question: ${query}`;
        text = await LLMGenerator.generate(prompt, logger);
        if (query.toLowerCase().includes("participate") || query.toLowerCase().includes("register")) {
          text += "\n\nWhat would you like to know next?";
          customChips = [
            { label: "📍 Venue", action: "Where is the venue?" },
            { label: "🏛 Committees", action: "What are the committees?" },
            { label: "💰 Registration Fee", action: "What is the fee?" },
            { label: "📅 Schedule", action: "What is the schedule?" },
            { label: "🎓 Eligibility", action: "What is the eligibility?" }
          ];
        }
      }
    } else {
      // Fallback for FAQ, Unknown, etc.
      const prompt = `${CONVERSATION_STYLE_GUIDE}

---

Answer the user's question about SMJMUN (Shri Seth Mangilal Ji Sahu International Model United Nations, founded by Mr. Aarushh Sahu) or standard MUN procedures.
If you do not know the answer, gently direct them to info@smjmun.com.

User Question: ${query}`;
      text = await LLMGenerator.generate(prompt, logger);
    }

    // 4. Response Composition
    const finalResponse = ResponseComposer.compose(text, responseType, {
      service: plan.targetService,
      chips: customChips
    });

    // 5. State Update
    state.currentTopic = context.query.intent;
    if (context.query.entity) {
      state.currentEntity = context.query.entity;
    } else if (domainData && domainData.data && domainData.data.length > 0 && plan.targetService === "conference") {
      state.currentEntity = domainData.data[0].title;
    }
    this.mockMemory[sessionId] = state;

    logger.logResponse(responseType, finalResponse.text.length);
    return finalResponse;
  }
}
