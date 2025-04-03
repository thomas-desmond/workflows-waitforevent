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
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workflows/workflows-starter/instances/${instanceId}/events/approval-for-ai-tagging`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TOKEN}`
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