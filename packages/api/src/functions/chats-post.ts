import { Readable } from 'node:stream';
import { HttpRequest, InvocationContext, HttpResponseInit, app } from '@azure/functions';
import { AIChatCompletionRequest, AIChatCompletionDelta } from '@microsoft/ai-chat-protocol';
import { AzureOpenAIEmbeddings, AzureChatOpenAI } from '@langchain/openai';
import { Embeddings } from '@langchain/core/embeddings';
import { AzureCosmsosDBNoSQLChatMessageHistory, AzureCosmosDBNoSQLVectorStore } from '@langchain/azure-cosmosdb';
import { FileSystemChatMessageHistory } from '@langchain/community/stores/message/file_system';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { VectorStore } from '@langchain/core/vectorstores';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { badRequest, data, serviceUnavailable } from '../http-response.js';
import { ollamaChatModel, ollamaEmbeddingsModel, faissStoreFolder } from '../constants.js';
import { getAzureOpenAiTokenProvider, getCredentials, getUserId } from '../security.js';
import {
  constructProcessContentRequestBody,
  enqueueOfflinePurviewTasksAsync,
  invokeProcessContentApi,
  invokeProtectionScopeApi,
} from '../purview-wrapper.js';

const ragSystemPrompt = `Assistant helps the Consto Real Estate company customers with questions and support requests. Be brief in your answers. Answer only plain text, DO NOT use Markdown.
Answer ONLY with information from the sources below. If there isn't enough information in the sources, say you don't know. Do not generate answers that don't use the sources. If asking a clarifying question to the user would help, ask the question.
If the user question is not in English, answer in the language used in the question.

Each source has the format "[filename]: information". ALWAYS reference the source filename for every part used in the answer. Use the format "[filename]" to reference a source, for example: [info1.txt]. List each source separately, for example: [info1.txt][info2.pdf].

Generate 3 very brief follow-up questions that the user would likely ask next.
Enclose the follow-up questions in double angle brackets. Example:
<<Am I allowed to invite friends for a party?>>
<<How can I ask for a refund?>>
<<What If I break something?>>

Do no repeat questions that have already been asked.
Make sure the last question ends with ">>".

SOURCES:
{context}`;

const titleSystemPrompt = `Create a title for this chat session, based on the user question. The title should be less than 32 characters. Do NOT use double-quotes.`;

const sessionSequenceMap = new Map<string, number>(); // Map to track sequence numbers for each user
const sessionProtectionDataMap = new Map<string, { etag: string; activityExecutionMap: Map<string, string> }>();

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_AD_API_ID!,
    clientSecret: process.env.AZURE_AD_API_SECRET!,
    authority: process.env.AZURE_AD_AUTHORITY_HOST!,
  },
};
const msalClient = new ConfidentialClientApplication(msalConfig);

async function getPurviewAccessTokenViaOBO(request: HttpRequest, context: InvocationContext): Promise<string> {
  // Extract the Authorization header
  const authorizationHeader = request.headers.get('Authorization');
  if (!authorizationHeader?.startsWith('Bearer ')) {
    context.error('Missing or invalid Authorization header');
    throw new Error('Missing or invalid Authorization header');
  }

  // Extract the bearer token
  const token = authorizationHeader.split(' ')[1];

  // Use OBO flow to get a new access token for the downstream API
  const downstreamApiScope = (process.env.AZURE_AD_GRAPH_SCOPE || 'https://graph.microsoft.com/.default')
    .split(' ')
    .map((scope) => scope.trim());

  return getAccessTokenOnBehalfOf(token, downstreamApiScope, context);
}

async function getAccessTokenOnBehalfOf(
  userToken: string,
  scopes: string[],
  context: InvocationContext,
): Promise<string> {
  try {
    const oboRequest = {
      oboAssertion: userToken,
      scopes,
    };

    const response = await msalClient.acquireTokenOnBehalfOf(oboRequest);
    if (!response?.accessToken) {
      context.error(`OBO returned empty: `, response);
      throw new Error('Failed to acquire token using OBO flow');
    }

    return response.accessToken;
  } catch (error) {
    context.error(`Error in OBO flow:`, error);
    throw error;
  }
}

function processProtectionScopeApiResponse(
  apiResponse: any,
  sessionId: string,
  etagIdentifier: string,
  context: InvocationContext,
): { activityExecutionMap: Map<string, string>; uploadTextExecutionMode: string; downloadTextExecutionMode: string } {
  const activityExecutionMap = new Map<string, string>();
  let isValidAppId = false;

  // Validate the API response
  if (!apiResponse?.value || !Array.isArray(apiResponse.value)) {
    context.error('The ProtectionScope API response does not contain a valid value array.');
  }

  /* Lint
  for (const entry of apiResponse.value) {
    const activitiesList = entry.activities?.split(',').map((activity: string) => activity.trim()) || [];
    const executionModeValue = entry.executionMode;

    activitiesList.forEach((activity: string) => {
      if (!activityExecutionMap.has(activity) || executionModeValue === 'evaluateInline') {
        activityExecutionMap.set(activity, executionModeValue);

        // Validate the locations array
        const locations = entry.locations || [];
        if (Array.isArray(locations)) {
          for (const location of locations) {
            if (location?.value === process.env.AZURE_AD_API_ID) {
              isValidAppId = true;
              break;
            }
          }
        }
      }
    });
  } */

  for (const entry of apiResponse.value) {
    const activitiesList: string[] = [];
    if (typeof entry.activities === 'string') {
      const wholeAcctivities = entry.activities;
      let activities: string[] = [];
      if (typeof wholeAcctivities === 'string') {
        activities = wholeAcctivities.split(',').filter((activity) => typeof activity === 'string');
      }

      for (const activity of activities) {
        if (typeof activity === 'string') {
          activitiesList.push(activity.trim());
        }
      }
    }

    const executionModeValue = entry.executionMode;

    for (const activity of activitiesList) {
      if (!activityExecutionMap.has(activity) || executionModeValue === 'evaluateInline') {
        activityExecutionMap.set(activity, executionModeValue);

        // Validate the locations array
        const locations = Array.isArray(entry.locations) ? entry.locations : [];
        for (const location of locations) {
          if (location?.value === process.env.AZURE_AD_API_ID) {
            isValidAppId = true;
            break;
          }
        }
      }
    }
  }

  if (!isValidAppId) {
    context.error('The Purview API returned a different value for the app ID. This is not expected.');
  }

  // Create separate variables for execution modes
  const uploadTextExecutionMode = activityExecutionMap.get('uploadText') || 'default';
  const downloadTextExecutionMode = activityExecutionMap.get('downloadText') || 'default';

  return { activityExecutionMap, uploadTextExecutionMode, downloadTextExecutionMode };
}

export async function postChats(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const azureOpenAiEndpoint = process.env.AZURE_OPENAI_API_ENDPOINT;

  try {
    // Check if the request body is valid JSON
    const requestBody = (await request.json()) as AIChatCompletionRequest;
    const { messages, context: chatContext } = requestBody;
    const userId = getUserId(request, requestBody);
    const sessionId = ((chatContext as any)?.sessionId as string) || uuidv4();
    const question = messages.at(-1)!.content;

    if (!messages || messages.length === 0 || !question || !userId || !sessionId) {
      context.error(`Invalid or missing messages in the request body`);
      return badRequest('Invalid or missing messages in the request body');
    }

    context.log(`Start: userId: ${userId}, sessionId: ${sessionId} question: ${question}`);

    // Increment the sequence number for the userid aginst session whihc is used later in the processContent API
    let currentSequence = sessionSequenceMap.get(sessionId) || 0;

    let etagIdentifier = 'default';
    let uploadTextExecutionMode = 'default'; // Read executionMode from the environment variable
    let downloadTextExecutionMode = 'default'; // Read executionMode from the environment variable
    // Get the Purview access token using via OBO flow
    const accessToken = await getPurviewAccessTokenViaOBO(request, context);

    // Retrieve the cached ETAG and the session data and if already exist skip calling the ProtectionScope API
    const storedSessionData = sessionProtectionDataMap.get(userId);

    // If session exists, retrieve the stored etag
    if (storedSessionData?.etag) {
      etagIdentifier = storedSessionData.etag;
      // Create separate variables for execution modes
      uploadTextExecutionMode = storedSessionData.activityExecutionMap.get('uploadText') || 'default';
      downloadTextExecutionMode = storedSessionData.activityExecutionMap.get('downloadText') || 'default';
      context.log(
        `Session exist : do not invoke protectionscopeapi: ${userId} ETag: ${etagIdentifier} Execution mode for uploadText: ${uploadTextExecutionMode} Execution mode for downloadText: ${downloadTextExecutionMode}`,
      );
    } else {
      // Invoke Porection scope
      const { body: apiResponse, etag: returnedEtag } = await invokeProtectionScopeApi(accessToken);

      etagIdentifier = returnedEtag || 'default'; // Update the etagIdentifier with the returned ETag from the API
      const {
        activityExecutionMap,
        uploadTextExecutionMode: newuploadTextMode,
        downloadTextExecutionMode: newdownloadTextMode,
      } = processProtectionScopeApiResponse(apiResponse, sessionId, etagIdentifier, context);

      context.log('ProtectionScope API Response:', JSON.stringify(apiResponse));
      // Store the session data
      sessionProtectionDataMap.set(userId, {
        etag: etagIdentifier,
        activityExecutionMap,
      });
      // Update the execution modes
      uploadTextExecutionMode = newuploadTextMode;
      downloadTextExecutionMode = newdownloadTextMode;
      context.log(
        `No session available : Invoked protectionscopeapi : userid: ${userId} ETag: ${etagIdentifier} Execution mode for uploadText: ${uploadTextExecutionMode} Execution mode for downloadText: ${downloadTextExecutionMode}`,
      );
    }

    if (uploadTextExecutionMode === 'evaluateInline') {
      context.log('Handling evaluateInline logic for uploadText...');
      // Construct the request body for the second API
      const processContentRequestBody = constructProcessContentRequestBody(
        question,
        'BuildDemo-P4AI',
        currentSequence,
        sessionId,
        'uploadText',
        process.env.AZURE_AD_API_ID || '',
      );

      context.log('ProcessContent Request Body:For the uploadText API(prompt)');
      context.log(JSON.stringify(processContentRequestBody));
      // Call the second API
      const { body: processContentResponse, headers: responseHeaderPrompt } = await invokeProcessContentApi(
        accessToken,
        etagIdentifier,
        processContentRequestBody,
      );

      currentSequence += 1; // Increment the sequence number for the next API call
      context.log('Process Content API Response body for Prompt:', processContentResponse);
      const headersObject = Object.fromEntries(responseHeaderPrompt.entries());
      context.log('Response Headers for Prompt:', JSON.stringify(headersObject));
      const processContentJSONResponse = JSON.parse(processContentResponse);
      // Clear teh cache if the protectionScopeState is modified so that we can invoke the protection scope
      if (processContentJSONResponse?.protectionScopeState === 'modified') {
        context.log(`Clear the ETAG cache`);

        // SessionProtectionDataMap.delete(userId); // Clear the cache
      }

      // Extract and process the `action` from policyActions
      const actionMode = processContentJSONResponse?.policyActions?.[0]?.action || 'default';
      context.log(`Action Mode from API response: ${actionMode}`);

      // Check the protectionScopeState
      if (actionMode === 'restrictAccess') {
        sessionSequenceMap.set(sessionId, currentSequence);
        context.log('Purview is instructing the app to block the prompt due to organizational policy.');
        // Create a custom stream for the "block" message
        const blockStream = Readable.from(
          createJsonStreamForBlock(
            sessionId,
            'This action has been blocked due to the security policies enforced by your organization.',
          ),
        );

        return data(blockStream, {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
        });
      }
    }

    // Processthe question and get the response
    context.log('Processing the question and getting the response...');
    let embeddings: Embeddings;
    let model: BaseChatModel;
    let store: VectorStore;
    let chatHistory;
    if (azureOpenAiEndpoint) {
      const credentials = getCredentials();
      const azureADTokenProvider = getAzureOpenAiTokenProvider();

      // Initialize models and vector database
      embeddings = new AzureOpenAIEmbeddings({ azureADTokenProvider });
      model = new AzureChatOpenAI({
        // Controls randomness. 0 = deterministic, 1 = maximum randomness
        temperature: 0.7,
        azureADTokenProvider,
      });
      store = new AzureCosmosDBNoSQLVectorStore(embeddings, { credentials });

      // Initialize chat history
      chatHistory = new AzureCosmsosDBNoSQLChatMessageHistory({
        sessionId,
        userId,
        credentials,
      });
    } else {
      // If no environment variables are set, it means we are running locally
      context.log('No Azure OpenAI endpoint set, using Ollama models and local DB');
      embeddings = new OllamaEmbeddings({ model: ollamaEmbeddingsModel });
      model = new ChatOllama({
        temperature: 0.7,
        model: ollamaChatModel,
      });
      store = await FaissStore.load(faissStoreFolder, embeddings);
      chatHistory = new FileSystemChatMessageHistory({
        sessionId,
        userId,
      });
    }

    // Create the chain that combines the prompt with the documents
    const ragChain = await createStuffDocumentsChain({
      llm: model,
      prompt: ChatPromptTemplate.fromMessages([
        ['system', ragSystemPrompt],
        ['human', '{input}'],
      ]),
      documentPrompt: PromptTemplate.fromTemplate('[{source}]: {page_content}\n'),
    });

    // Handle chat history
    const ragChainWithHistory = new RunnableWithMessageHistory({
      runnable: ragChain,
      inputMessagesKey: 'input',
      historyMessagesKey: 'chat_history',
      getMessageHistory: async () => chatHistory,
    });

    // Define the filename to filter
    const labelToFilter = 'default'; // Read labelToFilter from the environment variable

    // Update the retriever to include a filter for metadata.source
    const retriever = store.asRetriever(3);

    // Retrieve documents (without relying on the retriever's filter)
    const retrievedDocuments = await retriever.invoke(question);

    /*  Tier 2
    let filteredDocuments: any[];
    if (labelToFilter === 'default') {        
      filteredDocuments = retrievedDocuments; // Use all retrieved documents
    }
    else
    {
      // Split the labelToFilter into an array of labels (in case multiple labels are provided)
      const labelsToFilter = labelToFilter.split(',').map(label => label.trim());
      
      //tier 2 labels 
      // Filter documents based on whether their label_name is included in the labelsToFilter array
      filteredDocuments = retrievedDocuments.filter((doc: any) =>
        labelsToFilter.includes(doc.metadata?.label_metadata?.label_name)
        );
    } */

    const responseStream = await ragChainWithHistory.stream(
      {
        input: question,
        context: retrievedDocuments,
      },
      { configurable: { sessionId } },
    );

    // Collect the LLM response
    const llmResponse = await collectStream(responseStream);

    // Process the LLM response to append label_name to filenames
    // Process the LLM response to append label_name to filenames
    let processedLlmResponse = llmResponse;

    for (const document of retrievedDocuments) {
      const filename = document.metadata?.source;
      const labelName = document.metadata?.label_metadata?.label_name || 'Unknown'; // Default to 'Unknown' if label_name is missing
      const formattedReference = `[${filename} (Label: ${labelName})]`; // Include label_name within the square brackets
      // Replace occurrences of the filename in the response with the formatted reference
      processedLlmResponse = processedLlmResponse.replaceAll(`[${filename}]`, formattedReference);
    }

    if (downloadTextExecutionMode === 'evaluateInline') {
      context.log('Handling evaluateInline logic for downloadText...');
      // Construct the request body for the second processContent API
      const processContentRequestBodyForLLM = constructProcessContentRequestBody(
        processedLlmResponse,
        'BuildDemo-P4AI',
        currentSequence,
        sessionId,
        'downloadText',
        process.env.AZURE_AD_API_ID || '',
      );
      context.log('ProcessContent Request Body:For the downloadText API(Response)');
      context.log(JSON.stringify(processContentRequestBodyForLLM));

      // Call the second processContent API
      const { body: processContentResponseForLLM, headers: responseHeadersForLLM } = await invokeProcessContentApi(
        accessToken,
        etagIdentifier,
        processContentRequestBodyForLLM,
      );

      currentSequence += 1; // Increment the sequence number for the next API call

      context.log('Process Content API Response body for Response:', processContentResponseForLLM);
      const headersObject = Object.fromEntries(responseHeadersForLLM.entries());
      context.log('Process Content API Response Headers for Response:', JSON.stringify(headersObject));

      const processContentResponseJSONForLLM = JSON.parse(processContentResponseForLLM);

      // Clear teh cache if the protectionScopeState is modified so that we can invoke the protection scope
      if (processContentResponseJSONForLLM?.protectionScopeState === 'modified') {
        context.log(`Clear the ETAG cache`);

        // SessionProtectionDataMap.delete(userId); // Clear the cache
      }
      // Extract and process the `action` from policyActions

      const actionMode = processContentResponseJSONForLLM?.policyActions?.[0]?.action || 'default';
      context.log(`Action Mode from API response: ${actionMode}`);

      // Check the protectionScopeState
      if (actionMode === 'restrictAccess') {
        context.log('Purview is instructing the app to block the LLM response due to organizational policy.');
        // Create a custom stream for the "block" message
        const blockStream = Readable.from(
          createJsonStreamForBlock(
            sessionId,
            'This action has been blocked due to the security policies enforced by your organization.',
          ),
        );

        // Update the sequence number
        sessionSequenceMap.set(sessionId, currentSequence);
        return data(blockStream, {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
        });
      }
    }
    // Create a new stream from the collected LLM response

    const jsonStream = Readable.from(
      (async function* () {
        const responseChunk: AIChatCompletionDelta = {
          delta: {
            content: processedLlmResponse,
            role: 'assistant',
          },
          context: {
            sessionId,
          },
        };

        // Yield the entire response as a single NDJSON chunk
        yield JSON.stringify(responseChunk) + '\n';
      })(),
    );

    // Create a short title for this chat session
    const { title } = await chatHistory.getContext();
    if (!title) {
      const response = await ChatPromptTemplate.fromMessages([
        ['system', titleSystemPrompt],
        ['human', '{input}'],
      ])
        .pipe(model)
        .invoke({ input: question });
      context.log(`Title for session: ${response.content as string}`);
      chatHistory.setContext({ title: response.content });
    }

    // This is background task where we report the prompt and response to the Purview API later after queuing up .
    if (downloadTextExecutionMode === 'evaluateOffline' || uploadTextExecutionMode === 'evaluateOffline') {
      const status = await enqueueOfflinePurviewTasksAsync(
        accessToken,
        etagIdentifier,
        'BuildDemo-P4AI',
        process.env.AZURE_AD_API_ID || '',
        uploadTextExecutionMode,
        downloadTextExecutionMode,
        question,
        processedLlmResponse,
        sessionId,
        currentSequence,
        context,
      );
      context.log(`EnqueueOfflinePurviewTasksAsync status: ${status}`);
      // Update the sequence number
      sessionSequenceMap.set(sessionId, currentSequence + 2);
    }

    return data(jsonStream, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    });
  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`Error when processing chat-post request: ${error.message}`);

    return serviceUnavailable('Service temporarily unavailable. Please try again later.');
  }
}

async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  let result = '';
  for await (const chunk of stream) {
    result += chunk;
  }

  return result;
}

async function* createJsonStreamForBlock(sessionId: string, message: string) {
  const blockResponse: AIChatCompletionDelta = {
    delta: {
      content: message,
      role: 'assistant',
    },
    context: {
      sessionId,
    },
  };

  // Yield the "block" message as a single NDJSON chunk
  yield JSON.stringify(blockResponse) + '\n';
}
// Transform the response chunks into a JSON stream

async function* createJsonStream(chunks: AsyncIterable<string>, sessionId: string) {
  for await (const chunk of chunks) {
    if (!chunk) continue;

    const responseChunk: AIChatCompletionDelta = {
      delta: {
        content: chunk,
        role: 'assistant',
      },
      context: {
        sessionId,
      },
    };

    // Format response chunks in Newline delimited JSON
    // see https://github.com/ndjson/ndjson-spec
    yield JSON.stringify(responseChunk) + '\n';
  }
}

app.setup({ enableHttpStream: true });
app.http('chats-post', {
  route: 'chats/stream',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: postChats,
});
