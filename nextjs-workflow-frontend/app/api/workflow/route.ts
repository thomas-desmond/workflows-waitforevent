import { API_BASE_URL } from "@/app/components/image-upload/constants";
import { NextResponse } from "next/server";

interface RequestBody {
  instanceId: string;
  approved: boolean;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const { instanceId, approved } = body;

    console.log("data ", instanceId, approved)

    const response = await fetch(`${API_BASE_URL}/approval-for-ai-tagging`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ instanceId, approved }),
    });

    if (!response.ok) {
      console.error('Error response:', await response.text());
      throw new Error("Failed to send AI tag request");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in workflow API route:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
