import fs from 'node:fs/promises';
import { type HttpRequest, type HttpResponseInit, type InvocationContext, app } from '@azure/functions';
import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { AzureCosmosDBNoSQLVectorStore } from '@langchain/azure-cosmosdb';
import { OllamaEmbeddings } from '@langchain/ollama';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import 'dotenv/config';
import { BlobServiceClient } from '@azure/storage-blob';
import { CosmosClient } from '@azure/cosmos';
import { badRequest, serviceUnavailable, ok } from '../http-response.js';
import { ollamaEmbeddingsModel, faissStoreFolder } from '../constants.js';
import { getAzureOpenAiTokenProvider, getCredentials } from '../security.js';

export async function postDocuments(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const storageUrl = process.env.AZURE_STORAGE_URL;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
  const azureOpenAiEndpoint = process.env.AZURE_OPENAI_API_ENDPOINT;
  const cosmosEndpoint = process.env.AZURE_COSMOSDB_NOSQL_ENDPOINT;
  const cosmosKey = process.env.AZURE_COSMOS_KEY;
  const cosmosDatabaseName = 'vectorSearchDB';
  const cosmosContainerName = 'vectorSearchContainer';

  try {
    // Get the uploaded file from the request
    const parsedForm = await request.formData();

    // Enhanced validation for required fields
    if (!parsedForm.has('file')) {
      return badRequest('Required field "file" is missing from form data.');
    }

    // Validation for labelId and labelName
    // if (!parsedForm.has('labelId')) {
    //   return badRequest('Required field "labelId" is missing from form data.');
    // }

    // if (!parsedForm.has('labelName')) {
    //   return badRequest('Required field "labelName" is missing from form data.');
    // }

    // Type mismatch between Node.js FormData and Azure Functions FormData
    const file = parsedForm.get('file') as any as File;
    const filename = file.name;

    // Get label information from form data
    const labelId = parsedForm.get('labelId')?.toString() || '123456789';
    const labelName = parsedForm.get('labelName')?.toString() || 'General';

    // Check if document with same filename exists in database
    let shouldUpdate = false;
    if (azureOpenAiEndpoint && cosmosEndpoint) {
      try {
        context.log(`Checking if document "${filename}" already exists in database...`);
        const credentials = getCredentials();
        const cosmosClient = new CosmosClient({
          endpoint: cosmosEndpoint,
          aadCredentials: credentials, // Using Azure AD credentials instead of key
        });

        const database = cosmosClient.database(cosmosDatabaseName);
        const container = database.container(cosmosContainerName);

        // Query for documents with matching filename
        const querySpec = {
          query: 'SELECT * FROM c WHERE c.metadata.source = @filename',
          parameters: [{ name: '@filename', value: filename }],
        };

        const { resources: existingDocuments } = await container.items.query(querySpec).fetchAll();

        if (existingDocuments && existingDocuments.length > 0) {
          shouldUpdate = true;
          context.log(`Document "${filename}" already exists. Will update with new label information.`);
        }
      } catch (error) {
        context.log(`Error checking for existing document: ${(error as Error).message}`);
        // Continue with upload even if check fails
      }
    }

    // Extract text from the PDF
    const loader = new PDFLoader(file, {
      splitPages: false,
    });
    const rawDocument = await loader.load();
    rawDocument[0].metadata.source = filename;
    rawDocument[0].metadata.label_metadata = {
      label_id: labelId,
      label_name: labelName,
    };

    // Split the text into smaller chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1500,
      chunkOverlap: 100,
    });
    const documents = await splitter.splitDocuments(rawDocument);

    // Generate embeddings and save/update in database
    if (azureOpenAiEndpoint) {
      const credentials = getCredentials();
      const azureADTokenProvider = getAzureOpenAiTokenProvider();

      // ADDED: Delete existing document chunks if updating
      if (shouldUpdate && cosmosEndpoint) {
        try {
          context.log(`Updating document "${filename}" with new labels in Cosmos DB...`);
          const cosmosClient = new CosmosClient({
            endpoint: cosmosEndpoint,
            aadCredentials: credentials,
          });

          const database = cosmosClient.database(cosmosDatabaseName);
          const container = database.container(cosmosContainerName);

          // Delete existing documents with the same filename
          const querySpec = {
            query: 'SELECT * FROM c WHERE c.metadata.source = @filename',
            parameters: [{ name: '@filename', value: filename }],
          };

          const { resources: documentsToDelete } = await container.items.query(querySpec).fetchAll();

          if (documentsToDelete && documentsToDelete.length > 0) {
            for (const document of documentsToDelete) {
              container.item(document.id, document.id).delete();
            }

            context.log(`Deleted ${documentsToDelete.length} existing documents.`);
          }
        } catch (error) {
          context.log(`Error deleting existing documents: ${(error as Error).message}`);
        }
      }

      // Initialize embeddings model and vector database
      const embeddings = new AzureOpenAIEmbeddings({ azureADTokenProvider });

      // Added explicit parameters for better configuration
      await AzureCosmosDBNoSQLVectorStore.fromDocuments(documents, embeddings, {
        credentials,
        endpoint: cosmosEndpoint,
        databaseName: cosmosDatabaseName,
        containerName: cosmosContainerName,
      });
    } else {
      // If no environment variables are set, it means we are running locally
      context.log('No Azure OpenAI endpoint set, using Ollama models and local DB');
      const embeddings = new OllamaEmbeddings({ model: ollamaEmbeddingsModel });
      const folderExists = await checkFolderExists(faissStoreFolder);
      if (folderExists) {
        const store = await FaissStore.load(faissStoreFolder, embeddings);
        await store.addDocuments(documents);
        await store.save(faissStoreFolder);
      } else {
        const store = await FaissStore.fromDocuments(documents, embeddings, {});
        await store.save(faissStoreFolder);
      }
    }

    if (storageUrl && containerName) {
      // Upload the PDF file to Azure Blob Storage
      context.log(`Uploading file to blob storage: "${containerName}/${filename}"`);
      const credentials = getCredentials();
      const blobServiceClient = new BlobServiceClient(storageUrl, credentials);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(filename);
      const buffer = await file.arrayBuffer();
      await blockBlobClient.upload(buffer, file.size, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
      });
    } else {
      context.log('No Azure Blob Storage connection string set, skipping upload.');
    }

    return ok({ message: 'PDF file uploaded successfully.' });
  } catch (_error: unknown) {
    const error = _error as Error;
    context.error(`Error when processing document-post request: ${error.message}`);

    return serviceUnavailable('Service temporarily unavailable. Please try again later.');
  }
}

async function checkFolderExists(folderPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(folderPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

app.http('documents-post', {
  route: 'documents',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: postDocuments,
});
