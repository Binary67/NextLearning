import { readDueReviews } from "@/lib/reviews";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ reviews: await readDueReviews() });
  } catch (error) {
    console.error("Review queue could not be read:", error);
    return Response.json(
      { message: "The review queue could not be loaded." },
      { status: 500 },
    );
  }
}
