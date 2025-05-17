import { AIChatMessage, AIChatCompletionDelta, AIChatProtocolClient } from '@microsoft/ai-chat-protocol';
import { acquireToken } from './auth.js'; // Import the acquireToken method

export const apiBaseUrl: string = import.meta.env.VITE_API_URL || '';

export type ChatRequestOptions = {
  messages: AIChatMessage[];
  context?: Record<string, unknown>;
  chunkIntervalMs: number;
  apiUrl: string;
};

// Override the global fetch method to include the Authorization header
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  try {
    // Check if the request is for the API
    const url = typeof input === 'string' ? input : '';
    if (url.includes('api/chats/stream')) {
      // Acquire the token for API calls
      const token = await acquireToken();
      if (!token) {
        throw new Error('Failed to acquire token. User may not be signed in.');
      }

      // Add the Authorization header
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);

      return await originalFetch(input, { ...init, headers });
    }

    // For non-API calls, proceed without modification
    return await originalFetch(input, init);
  } catch (error) {
    console.error('Error in custom fetch:', error);
    throw error;
  }
};

export async function* getCompletion(options: ChatRequestOptions) {
  const apiUrl = options.apiUrl || apiBaseUrl;
  const client = new AIChatProtocolClient(`${apiUrl}/api/chats`);
  const result = await client.getStreamedCompletion(options.messages, { context: options.context });

  for await (const response of result) {
    if (!response.delta) {
      continue;
    }

    yield new Promise<AIChatCompletionDelta>((resolve) => {
      setTimeout(() => {
        resolve(response);
      }, options.chunkIntervalMs);
    });
  }
}

export function getCitationUrl(citation: string): string {
  return `${apiBaseUrl}/api/documents/${citation}`;
}
