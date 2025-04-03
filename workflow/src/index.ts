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

		console.log('image', file);

		const imageNameFromWorkflow = await step.do(
			'Upload image to R2',
			{
				retries: {
					limit: 2, // The total number of attempts
					delay: '2 seconds', // Delay between each retry
				},
			},
			async () => {
				await this.env.workflow_demo_bucket.put(file.name, file);
				return file.name; // Return the file name as the key
			}
		);

		await step.do('Insert image name into database', async () => {
			await this.env.DB.prepare('INSERT INTO Images (ImageKey) VALUES (?)').bind(imageNameFromWorkflow).run();
		});

		const waitForApproval = await step.waitForEvent('request-ai-tagging-approval', {
			type: 'approval-for-ai-tagging', // define an optional key to switch on
			timeout: '5 minute', // keep it short for the example!
		});

		// // You can optionally have a Workflow wait for additional data:
		// // human approval or an external webhook or HTTP request, before progressing.
		// // You can submit data via HTTP POST to /accounts/{account_id}/workflows/{workflow_name}/instances/{instance_id}/events/{eventName}
		// const waitForApproval = await step.waitForEvent('request-approval', {
		// 	type: 'approval', // define an optional key to switch on
		// 	// timeout: '1 minute', // keep it short for the example!
		// });

		// const ipResponse = await step.do('some other step', async () => {
		// 	let resp = await fetch('https://api.cloudflare.com/client/v4/ips');
		// 	return await resp.json<any>();
		// });

		// // await step.sleep('wait on something', '1 minute');

		// await step.do(
		// 	'make a call to write that could maybe, just might, fail',
		// 	// Define a retry strategy
		// 	{
		// 		retries: {
		// 			limit: 5,
		// 			delay: '5 second',
		// 			backoff: 'exponential',
		// 		},
		// 		timeout: '15 minutes',
		// 	},
		// 	async () => {
		// 		// Do stuff here, with access to the state from our previous steps
		// 		if (Math.random() > 0.5) {
		// 			throw new Error('API call to $STORAGE_SYSTEM failed');
		// 		}
		// 	}
		// );
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

				// Here you can:
				// 1. Store the image in R2
				// 2. Process the image
				// 3. Start a workflow with the image
				// For now, we'll just return a success response
				// return new Response(JSON.stringify({
				// 	success: true,
				// 	filename: image.name,
				// 	size: image.size,
				// 	type: image.type
				// }), {
				// 	headers: {
				// 		'Content-Type': 'application/json'
				// 	}
				// });
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
			details: await instance.status()
		});
	},
};
// </docs-tag name="workflows-fetch-handler">
// </docs-tag name="full-workflow-example">
