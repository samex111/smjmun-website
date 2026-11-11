import { db } from "@/lib/db";
import type { SupportChannel, SupportUrgency } from "@prisma/client";

type CreateSupportCaseInput = {
  actor:{channel:"website"|"whatsapp";sessionId:string;phone?:string;verifiedRegistrationId?:string};
  reason:string;
  requestedAction:string;
  summary:string;
  urgency:"normal"|"high"|"critical";
};

export async function createSupportCase(input:CreateSupportCaseInput) {
  const registration = input.actor.verifiedRegistrationId
    ? await db.registration.findUnique({where:{id:input.actor.verifiedRegistrationId}})
    : null;
  const supportCase = await db.supportCase.create({
    data:{
      channel:input.actor.channel.toUpperCase() as SupportChannel,
      sessionId:input.actor.sessionId,
      requesterPhone:input.actor.phone,
      registrationId:registration?.id,
      requesterName:registration ? `${registration.firstName} ${registration.lastName}` : null,
      requesterEmail:registration?.email,
      reason:input.reason,
      requestedAction:input.requestedAction,
      summary:input.summary,
      urgency:input.urgency.toUpperCase() as SupportUrgency,
      status:"OPEN",
    },
  });
  const notification = [
    "SMJMUN — Human support requested",
    `Case: ${supportCase.id}`,
    `Channel: ${input.actor.channel}`,
    `Name: ${supportCase.requesterName || "Not verified"}`,
    `Phone: ${supportCase.requesterPhone || "Unavailable"}`,
    `Email: ${supportCase.requesterEmail || "Unavailable"}`,
    `Registration: ${supportCase.registrationId || "Not linked"}`,
    `Reason: ${input.reason}`,
    `Requested action: ${input.requestedAction}`,
    `Summary: ${input.summary}`,
    `Priority: ${input.urgency}`,
  ].join("\n");
  return {caseId:supportCase.id,status:supportCase.status,notificationText:notification};
}
