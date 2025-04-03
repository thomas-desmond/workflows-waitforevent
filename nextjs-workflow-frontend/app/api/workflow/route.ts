import { NextResponse } from 'next/server';

interface RequestBody {
  instanceId: string;
  approved: boolean;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as RequestBody;
    const { instanceId, approved } = body;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/4ada3fc2e7dcf09a09749af670622778/workflows/workflows-starter/instances/${instanceId}/events/approval-for-ai-tagging`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer 1y7FHYKatU4cpW_BVW2ytS15WidlEujP2gxpTCjv'
        },
        body: JSON.stringify({ approved })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send AI tag request');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in workflow API route:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 