import { isTutorialId } from "@/lib/document-storage";
import {
  isContentLengthOverLimit,
  isUtf8TextOverLimit,
} from "@/lib/request-body-size";
import { readPreparedTutorial } from "@/lib/tutorial";

export const runtime = "nodejs";

const MAX_SDP_REQUEST_SIZE = 64 * 1024;

type TutorialRealtimeRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

export async function POST(
  request: Request,
  context: TutorialRealtimeRouteContext,
) {
  const { tutorialId } = await context.params;

  if (!isTutorialId(tutorialId)) {
    return tutorialNotFoundResponse();
  }

  const tutorial = await readPreparedTutorial(tutorialId);

  if (!tutorial) {
    return tutorialNotFoundResponse();
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    return Response.json(
      {
        message:
          "Realtime tutoring is not configured. Check the Azure OpenAI server settings.",
      },
      { status: 503 },
    );
  }

  if (
    isContentLengthOverLimit(
      request.headers.get("content-length"),
      MAX_SDP_REQUEST_SIZE,
    )
  ) {
    return Response.json(
      { message: "The WebRTC session offer is too large." },
      { status: 413 },
    );
  }

  const sdp = await request.text();

  if (isUtf8TextOverLimit(sdp, MAX_SDP_REQUEST_SIZE)) {
    return Response.json(
      { message: "The WebRTC session offer is too large." },
      { status: 413 },
    );
  }

  if (!sdp.trim()) {
    return Response.json(
      { message: "A WebRTC session offer is required." },
      { status: 400 },
    );
  }

  const realtimeEndpoint = endpoint.replace(/\/+$/, "");
  const sessionConfig = {
    session: {
      type: "realtime",
      model: deployment,
      output_modalities: ["audio"],
      audio: {
        input: {
          turn_detection: null,
        },
        output: {
          voice: "marin",
        },
      },
    },
  };

  try {
    const clientSecretResponse = await fetch(
      `${realtimeEndpoint}/realtime/client_secrets`,
      {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sessionConfig),
      },
    );
    const clientSecretBody = await clientSecretResponse.text();

    if (!clientSecretResponse.ok) {
      console.error(
        "Azure OpenAI Realtime client secret failed:",
        clientSecretBody,
      );

      return tutorUnavailableResponse();
    }

    const clientSecret = readClientSecret(clientSecretBody);

    if (!clientSecret) {
      console.error(
        "Azure OpenAI Realtime returned an invalid client secret.",
      );

      return tutorUnavailableResponse();
    }

    const response = await fetch(
      `${realtimeEndpoint}/realtime/calls`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: sdp,
      },
    );
    const responseBody = await response.text();

    if (!response.ok) {
      console.error(
        "Azure OpenAI Realtime session failed:",
        responseBody,
      );

      return tutorUnavailableResponse();
    }

    return new Response(responseBody, {
      status: response.status,
      headers: {
        "Content-Type": "application/sdp",
      },
    });
  } catch (error) {
    console.error("Azure OpenAI Realtime session failed:", error);

    return tutorUnavailableResponse();
  }
}

function tutorialNotFoundResponse() {
  return Response.json(
    { message: "That document is not available." },
    { status: 404 },
  );
}

function tutorUnavailableResponse() {
  return Response.json(
    { message: "The Realtime tutor could not start." },
    { status: 502 },
  );
}

function readClientSecret(responseBody: string) {
  try {
    const value = JSON.parse(responseBody) as unknown;

    if (
      typeof value === "object" &&
      value !== null &&
      "value" in value &&
      typeof value.value === "string" &&
      value.value.length > 0
    ) {
      return value.value;
    }
  } catch {
    return null;
  }

  return null;
}
