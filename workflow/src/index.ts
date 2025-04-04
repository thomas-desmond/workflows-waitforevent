import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { nanoid } from 'nanoid'

type Env = {
	// Add your bindings here, e.g. Workers KV, D1, Workers AI, etc.
	MY_WORKFLOW: Workflow;
	workflow_demo_bucket: R2Bucket;
	DB: D1Database;
	AI: Ai;
};

// User-defined params passed to your workflow
type Params = {
	imageKey: string;
};

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

// <docs-tag name="workflow-entrypoint">
export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		// Can access bindings on `this.env`
		// Can access params on `event.payload`
		const { imageKey } = event.payload;

		await step.do('Insert image name into database', async () => {
			await this.env.DB.prepare('INSERT INTO Images (ImageKey, InstanceID) VALUES (?, ?)')
				.bind(imageKey, event.instanceId)
				.run();
		});

		const waitForApproval = await step.waitForEvent('request-ai-tagging-approval', {
			type: 'approval-for-ai-tagging', // define an optional key to switch on
			timeout: '5 minute', // keep it short for the example!
		});

		if (waitForApproval.payload.approved) {
			const aiTags = await step.do('Generate AI tags', async () => {
				const image = await this.env.workflow_demo_bucket.get(imageKey);
				if (!image) throw new Error('Image not found');
				const arrayBuffer = await image.arrayBuffer();
				const uint8Array = new Uint8Array(arrayBuffer);

				const input = {
					image: Array.from(uint8Array),
					prompt:
						'Give me 5 different single word description tags for the image. Return them as a comma separated list with only the tags, no other text.',
					max_tokens: 512,
				};

				const response = await this.env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', input);
				return response.description;
			});

			await step.do('Update DB with AI tags', async () => {
				await this.env.DB.prepare('UPDATE Images SET ImageTags = ? WHERE InstanceID = ?').bind(aiTags, event.instanceId).run();
			});
		}
	}
}
// </docs-tag name="workflow-entrypoint">

// <docs-tag name="workflows-fetch-handler">
export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);

		// Handle Creating new image Workflow
		if (req.method === 'POST') {
			try {
				// Check if the request contains form data
				const contentType = req.headers.get('content-type');
				if (!contentType || !contentType.includes('multipart/form-data')) {
					return new Response('Invalid content type. Expected multipart/form-data', { status: 400 });
				}

				// Parse the form data
				const formData = await req.formData();
				const image = formData.get('image') as File;

				if (!image || !(image instanceof File)) {
					return new Response('Missing or invalid image file', { status: 400 });
				}
				const imageKey = nanoid()
				await env.workflow_demo_bucket.put(imageKey, image);

				// Convert File to serializable format

				// Spawn a new instance and return the ID and status
				const instance = await env.MY_WORKFLOW.create({
					params: {
						imageKey: imageKey
					},
				});
				return Response.json(
					{
						id: instance.id,
						details: await instance.status(),
						success: true,
						message: 'Image upload started successfully',
					},
					{
						headers: corsHeaders,
					}
				);

			} catch (error) {
				console.error('Error processing image upload:', error);
				return new Response('Error processing image upload', { status: 500 });
			}
		}

		// Handle other routes
		if (url.pathname.startsWith('/favicon')) {
			return Response.json({}, { status: 404 });
		}

		// Handle OPTIONS request for CORS preflight
		if (req.method === 'OPTIONS') {
			return new Response(null, {
				headers: corsHeaders,
			});
		}
		if (url.pathname === '/tags') {
			const instanceId = url.searchParams.get('instanceId');
			if (!instanceId) {
				return new Response('Missing instanceId parameter', {
					status: 400,
					headers: corsHeaders
				});
			}

			try {
				const result = await env.DB.prepare('SELECT ImageTags FROM Images WHERE InstanceID = ?')
					.bind(instanceId)
					.first();

				return Response.json(
					{
						instanceId,
						tags: result?.ImageTags || null
					},
					{
						headers: corsHeaders
					}
				);
			} catch (error) {
				console.error('Error fetching tags:', error);
				return new Response('Error fetching tags', {
					status: 500,
					headers: corsHeaders
				});
			}
		}

		// Get the status of an existing instance, if provided
		const id = url.searchParams.get('instanceId');
		if (id) {
			const instance = await env.MY_WORKFLOW.get(id);
			return Response.json(
				{
					status: await instance.status(),
				},
				{
					headers: corsHeaders,
				}
			);
		}

		// Handle /tags endpoint


		return new Response('Invalid Request', { status: 400 });
	},
};

