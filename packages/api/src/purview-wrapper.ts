import { InvocationContext } from '@azure/functions/types/InvocationContext';
import fetch from 'node-fetch';

/**
 * Invokes the specified API using the provided access token and request body.
 * @param apiUrl - The API endpoint to invoke.
 * @param accessToken - The access token for authorization.
 * @param requestBody - The JSON request body to send.
 * @returns The parsed JSON response from the API.
 * @throws Error if the API call fails.
 */
export async function invokeProtectionScopeApi(accessToken: string): Promise<{ body: any; etag: string | null }> {
  try {
    const purviewBaseUrl = process.env.PURVIEW_BASE_URL;
    if (!purviewBaseUrl) {
      throw new Error('PURVIEW_BASE_URL is not defined in the environment variables.');
    }

    const protectionScopePath = 'me/dataSecurityAndGovernance/protectionScopes/compute';
    const apiUrl = `${purviewBaseUrl.replace(/\/+$/, '')}/${protectionScopePath.replace(/^\/+/, '')}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // Empty JSON body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API call failed with status ${response.status}: ${errorText}`);
    }

    const etag = response.headers.get('etag'); // Extract the etag header
    const body = await response.json(); // Parse the response body

    return { body, etag };
  } catch (error) {
    console.error('Error invoking API:', error);
    throw error;
  }
}

export async function invokeProcessContentApi(
  accessToken: string,
  etag: string, // Add etag as a parameter
  requestBody: object,
): Promise<{ body: any; headers: Headers }> {
  try {
    const purviewBaseUrl = process.env.PURVIEW_BASE_URL;
    if (!purviewBaseUrl) {
      throw new Error('PURVIEW_BASE_URL is not defined in the environment variables.');
    }

    const processContentPath = 'me/dataSecurityAndGovernance/processContent';
    const apiUrl = `${purviewBaseUrl.replace(/\/+$/, '')}/${processContentPath.replace(/^\/+/, '')}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'If-None-Match': etag || '', // Include the etag in the request headers
      },
      body: JSON.stringify(requestBody), // Pass the request body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API call failed with status ${response.status}: ${errorText}`);
    }

    const body = await response.text(); // Parse the response body
    return { body, headers: response.headers as any }; // Cast headers to any to resolve type mismatch
  } catch (error) {
    console.error('Error invoking Process Content API:', error);
    throw error;
  }
}

export async function enqueueOfflinePurviewTasksAsync(
  accessToken: string,
  etag: string, // Add etag as a parameter
  name: string,
  applicationId: string,
  uploadTextMode: string,
  downloadTextMode: string,
  prompt: string,
  response: string,
  sessionId: string,
  sequenceNo: number,
  context: InvocationContext,
): Promise<string> {
  try {
    if (uploadTextMode === 'evaluateOffline') {
      context.log('Handling evaluateOffline logic for uploadText...');
      // Construct the request body for the second API
      const processContentRequestBody = constructProcessContentRequestBody(
        prompt,
        name,
        sequenceNo,
        sessionId,
        'uploadText',
        applicationId,
      );

      context.log('ProcessContent Request Body:For the uploadText API(prompt)');
      context.log(JSON.stringify(processContentRequestBody));
      // Call the second API
      const { body: processContentResponse, headers: responseHeaderPrompt } = await invokeProcessContentApi(
        accessToken,
        etag,
        processContentRequestBody,
      );

      context.log('Process Content API Response body for Prompt:', processContentResponse);
      const headersObject = Object.fromEntries(responseHeaderPrompt.entries());
      context.log('Response Headers for Prompt:', JSON.stringify(headersObject));
    }

    if (downloadTextMode === 'evaluateOffline') {
      context.log('Handling evaluateOffline logic for downloadText...');
      // Construct the request body for the second API
      const processContentRequestBodyForLLM = constructProcessContentRequestBody(
        response,
        name,
        sequenceNo + 1,
        sessionId,
        'downloadText',
        applicationId,
      );
      context.log('ProcessContent Request Body:For the downloadText API(Response)');
      context.log(JSON.stringify(processContentRequestBodyForLLM));

      // Call the second processContent API
      const { body: processContentResponseForLLM, headers: responseHeadersForLLM } = await invokeProcessContentApi(
        accessToken,
        etag,
        processContentRequestBodyForLLM,
      );
      context.log('Process Content API Response body for Response:', processContentResponseForLLM);
      const headersObject = Object.fromEntries(responseHeadersForLLM.entries());
      context.log('Process Content API Response Headers for Response:', JSON.stringify(headersObject));
    }

    // Return the HTTP status text
    return 'OK'; // Assuming the status text is "OK" for successful responses
  } catch (error) {
    context.error(`Error invoking ProcessContent API`, error);
    throw error;
  }
}

/* Lint changes 
  export function generateGuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
} */

export function generateGuid(): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  let guid = '';

  for (const char of template) {
    if (char === 'x') {
      const r = Math.trunc(Math.random() * 16); // Generate a random number between 0 and 15
      guid += r.toString(16); // Convert to hexadecimal
    } else if (char === 'y') {
      const r = (Math.trunc(Math.random() * 16) % 4) + 8; // Ensure the value is between 8 and 11
      guid += r.toString(16); // Convert to hexadecimal
    } else {
      guid += char; // Add the static characters like '-' directly
    }
  }

  return guid;
}

export function constructProcessContentRequestBody(
  contentData: string,
  name: string,
  sequenceNo: number,
  correlationId: string,
  activity: string,
  applicationId: string,
): object {
  return {
    contentToProcess: {
      contentEntries: [
        {
          '@odata.type': 'microsoft.graph.processConversationMetadata',
          identifier: generateGuid(), // Use applicationId as the identifier
          content: {
            '@odata.type': 'microsoft.graph.textContent',
            data: contentData, // Pass the content data
          },
          name, // Pass the name
          correlationId, // Pass the correlationId
          sequenceNumber: sequenceNo, // Pass the sequence number
          isTruncated: false,
          createdDateTime: new Date().toISOString(), // Current timestamp
          modifiedDateTime: new Date().toISOString(), // Current timestamp
        },
      ],
      activityMetadata: {
        activity, // Example activity
      },
      deviceMetadata: {
        deviceType: 'managed',
        operatingSystemSpecifications: {
          operatingSystemPlatform: 'Windows 11',
          operatingSystemVersion: '10.0.26100.0',
        },
      },
      protectedAppMetadata: {
        name,
        version: '1.0',
        applicationLocation: {
          '@odata.type': 'microsoft.graph.policyLocationApplication',
          value: applicationId, // Use applicationId as the location value
        },
      },
      integratedAppMetadata: {
        name,
        version: '1.0',
      },
    },
  };
}
