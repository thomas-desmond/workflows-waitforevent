// <docs-tag name="full-workflow-example">
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

type Env = {
	// Add your bindings here, e.g. Workers KV, D1, Workers AI, etc.
	MY_WORKFLOW: Workflow;
	workflow_demo_bucket: R2Bucket;
	DB: D1Database;
	AI: Ai;
};

// User-defined params passed to your workflow
type Params = {
	image: {
		data: number[];
		name: string;
		type: string;
	};
};

// <docs-tag name="workflow-entrypoint">
export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		// Can access bindings on `this.env`
		// Can access params on `event.payload`
		const { image } = event.payload;

		// Reconstruct File from serialized data
		const uint8Array = new Uint8Array(image.data);
		const file = new File([uint8Array], image.name, { type: image.type });

		const imageNameFromWorkflow = await step.do('Upload image to R2', async () => {
			await this.env.workflow_demo_bucket.put(file.name, file);
			return file.name; // Return the file name as the key
		});

		await step.do('Insert image name into database', async () => {
			await this.env.DB.prepare('INSERT INTO Images (ImageKey, InstanceID) VALUES (?, ?)')
				.bind(imageNameFromWorkflow, event.instanceId)
				.run();
		});

		const waitForApproval = await step.waitForEvent('request-ai-tagging-approval', {
			type: 'approval-for-ai-tagging', // define an optional key to switch on
			timeout: '5 minute', // keep it short for the example!
		});

		if (waitForApproval.payload.approved) {
			const aiTags = await step.do('Generate AI tags', async () => {
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

		// Handle image uploads
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

				// Convert File to serializable format
				const arrayBuffer = await image.arrayBuffer();
				const uint8Array = new Uint8Array(arrayBuffer);

				// Spawn a new instance and return the ID and status
				const instance = await env.MY_WORKFLOW.create({
					params: {
						image: {
							data: Array.from(uint8Array),
							name: image.name,
							type: image.type,
						},
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
						headers: {
							'Access-Control-Allow-Origin': '*',
							'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
							'Access-Control-Allow-Headers': 'Content-Type',
						},
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
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});
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
					headers: {
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
						'Access-Control-Allow-Headers': 'Content-Type',
					},
				}
			);
		}

		// Spawn a new instance and return the ID and status
		const instance = await env.MY_WORKFLOW.create();
		return Response.json({
			id: instance.id,
			details: await instance.status(),
		});
	},
};
// </docs-tag name="workflows-fetch-handler">
// </docs-tag name="full-workflow-example">
