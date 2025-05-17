<!-- prettier-ignore -->
<div align="center">

<img src="./packages/webapp/public/favicon.png" alt="" align="center" height="64" />

# Serverless AI Chat with RAG using LangChain.js

[![Open project in GitHub Codespaces](https://img.shields.io/badge/Codespaces-Open-blue?style=flat-square&logo=github)](https://codespaces.new/Azure-Samples/serverless-chat-langchainjs?hide_repo_select=true&ref=main&quickstart=true)
[![Join Azure AI Community Discord](https://img.shields.io/badge/Discord-Azure_AI_Community-blue?style=flat-square&logo=discord&color=5865f2&logoColor=fff)](https://discord.gg/kzRShWzttr)
[![Official Learn documentation](https://img.shields.io/badge/Documentation-00a3ee?style=flat-square)](https://learn.microsoft.com/azure/developer/javascript/ai/get-started-app-chat-template-langchainjs)
[![Watch to learn about RAG and this sample on YouTube](https://img.shields.io/badge/YouTube-d95652.svg?style=flat-square&logo=youtube)](https://www.youtube.com/watch?v=xkFOmx5yxIA&list=PLlrxD0HtieHi5ZpsHULPLxm839IrhmeDk&index=4)
[![dev.to blog post walkthrough](https://img.shields.io/badge/Blog%20post-black?style=flat-square&logo=dev.to)](https://dev.to/azure/build-a-serverless-chatgpt-with-rag-using-langchainjs-3487)
<br>
[![Build Status](https://img.shields.io/github/actions/workflow/status/Azure-Samples/serverless-chat-langchainjs/build-test.yaml?style=flat-square&label=Build)](https://github.com/Azure-Samples/serverless-chat-langchainjs/actions)
![Node version](https://img.shields.io/badge/Node.js->=20-3c873a?style=flat-square)
[![Ollama + Llama3.1](https://img.shields.io/badge/Ollama-Llama3.1-ff7000?style=flat-square)](https://ollama.com/library/llama3.1)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

:star: If you like this sample, star it on GitHub — it helps a lot!

[Overview](#overview) • [Get started](#getting-started) • [Run the sample](#run-the-sample) • [Resources](#resources) • [FAQ](#faq) • [Troubleshooting](#troubleshooting)

![Animation showing the chat app in action](./docs/images/demo.gif)

</div>

This sample is originally forked from [Azure-Samples/serverless-chat-langchainjs](https://github.com/Azure-Samples/serverless-chat-langchainjs) and has been modified to integrate with the **Microsoft Purview API**. This integration showcases how Purview can be used to **audit and secure AI prompts and responses**. Most of the deployment instructions remain the same as in the original repository. However, there are additional steps required for the Purview integration,and it has to be done pre-deployment phase and explained in the [Purview API Integration](#purview-api-integration) section below.

This sample shows how to build a serverless AI chat experience with Retrieval-Augmented Generation using [LangChain.js](https://js.langchain.com/) and Azure. The application is hosted on [Azure Static Web Apps](https://learn.microsoft.com/azure/static-web-apps/overview) and [Azure Functions](https://learn.microsoft.com/azure/azure-functions/functions-overview?pivots=programming-language-javascript), with [Azure Cosmos DB for NoSQL](https://learn.microsoft.com/azure/cosmos-db/nosql/vector-) as the vector database. You can use it as a starting point for building more complex AI applications.

> [!TIP]
> You can test this application locally without any cost using [Ollama](https://ollama.com/). Follow the instructions in the [Local Development](#local-development) section to get started.

## Overview

Building AI applications can be complex and time-consuming, but using LangChain.js and Azure serverless technologies allows to greatly simplify the process. This application is a chatbot that uses a set of enterprise documents to generate responses to user queries.

We provide sample data to make this sample ready to try, but feel free to replace it with your own. We use a fictitious company called _Contoso Real Estate_, and the experience allows its customers to ask support questions about the usage of its products. The sample data includes a set of documents that describes its terms of service, privacy policy and a support guide.

<div align="center">
  <img src="./docs/images/architecture.drawio.png" alt="Application architecture" width="640px" />
</div>

This application is made from multiple components:

- A web app made with a single chat web component built with [Lit](https://lit.dev) and hosted on [Azure Static Web Apps](https://learn.microsoft.com/azure/static-web-apps/overview). The code is located in the `packages/webapp` folder.

- A serverless API built with [Azure Functions](https://learn.microsoft.com/azure/azure-functions/functions-overview?pivots=programming-language-javascript) and using [LangChain.js](https://js.langchain.com/) to ingest the documents and generate responses to the user chat queries. The code is located in the `packages/api` folder.

- A database to store chat sessions and the text extracted from the documents and the vectors generated by LangChain.js, using [Azure Cosmos DB for NoSQL](https://learn.microsoft.com/azure/cosmos-db/nosql/).

- A file storage to store the source documents, using [Azure Blob Storage](https://learn.microsoft.com/azure/storage/blobs/storage-blobs-introduction).

We use the [HTTP protocol for AI chat apps](https://aka.ms/chatprotocol) to communicate between the web app and the API.

## Features

- **Serverless Architecture**: Utilizes Azure Functions and Azure Static Web Apps for a fully serverless deployment.
- **Retrieval-Augmented Generation (RAG)**: Combines the power of Azure Cosmos DB and LangChain.js to provide relevant and accurate responses.
- **Chat Sessions History**: Maintains a personal chat history for each user, allowing them to revisit previous conversations.
- **Scalable and Cost-Effective**: Leverages Azure's serverless offerings to provide a scalable and cost-effective solution.
- **Local Development**: Supports local development using Ollama for testing without any cloud costs.

## Getting started

There are multiple ways to get started with this project.

The quickest way is to use [GitHub Codespaces](#use-github-codespaces) that provides a preconfigured environment for you. Alternatively, you can [set up your local environment](#use-your-local-environment) following the instructions below.

> [!IMPORTANT]
> If you want to run this sample entirely locally using Ollama, you have to follow the instructions in the [local environment](#use-your-local-environment) section.

### Use your local environment

You need to install following tools to work on your local machine:

- [Node.js LTS](https://nodejs.org/download/)
- [Azure Developer CLI](https://aka.ms/azure-dev/install)
- [Git](https://git-scm.com/downloads)
- [PowerShell 7+](https://github.com/powershell/powershell) _(for Windows users only)_
  - **Important**: Ensure you can run `pwsh.exe` from a PowerShell command. If this fails, you likely need to upgrade PowerShell.
  - Instead of Powershell, you can also use Git Bash or WSL to run the Azure Developer CLI commands.
- [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local?tabs=macos%2Cisolated-process%2Cnode-v4%2Cpython-v2%2Chttp-trigger%2Ccontainer-apps&pivots=programming-language-javascript) _(should be installed automatically with NPM, only install manually if the API fails to start)_

Then you can get the project code:

1. [**Fork**](https://github.com/Azure-Samples/serverless-chat-langchainjs/fork) the project to create your own copy of this repository.
2. On your forked repository, select the **Code** button, then the **Local** tab, and copy the URL of your forked repository.

<div align="center">
  <img src="./docs/images/clone-url.png" alt="Screenshot showing how to copy the repository URL" width="400px" />
</div>
3. Open a terminal and run this command to clone the repo: <code> git clone &lt;your-repo-url&gt; </code>

### Use GitHub Codespaces

You can run this project directly in your browser by using GitHub Codespaces, which will open a web-based VS Code:

[![Open in GitHub Codespaces](https://img.shields.io/static/v1?style=for-the-badge&label=GitHub+Codespaces&message=Open&color=blue&logo=github)](https://codespaces.new/Azure-Samples/serverless-chat-langchainjs?hide_repo_select=true&ref&quickstart=true)

### Use a VSCode dev container

A similar option to Codespaces is VS Code Dev Containers, that will open the project in your local VS Code instance using the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).

You will also need to have [Docker](https://www.docker.com/products/docker-desktop) installed on your machine to run the container.

[![Open in Dev Containers](https://img.shields.io/static/v1?style=for-the-badge&label=Dev%20Containers&message=Open&color=blue&logo=visualstudiocode)](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/Azure-Samples/serverless-chat-langchainjs)

## Run the sample

There are multiple ways to run this sample: locally using Ollama or Azure OpenAI models, or by deploying it to Azure.

### Deploy the sample to Azure

#### Azure prerequisites

- **Azure account**. If you're new to Azure, [get an Azure account for free](https://azure.microsoft.com/free) to get free Azure credits to get started. If you're a student, you can also get free credits with [Azure for Students](https://aka.ms/azureforstudents).
- **Azure subscription with access enabled for the Azure OpenAI service**. You can request access with [this form](https://aka.ms/oaiapply).
- **Azure account permissions**:
  - Your Azure account must have `Microsoft.Authorization/roleAssignments/write` permissions, such as [Role Based Access Control Administrator](https://learn.microsoft.com/azure/role-based-access-control/built-in-roles#role-based-access-control-administrator-preview), [User Access Administrator](https://learn.microsoft.com/azure/role-based-access-control/built-in-roles#user-access-administrator), or [Owner](https://learn.microsoft.com/azure/role-based-access-control/built-in-roles#owner). If you don't have subscription-level permissions, you must be granted [RBAC](https://learn.microsoft.com/azure/role-based-access-control/built-in-roles#role-based-access-control-administrator-preview) for an existing resource group and [deploy to that existing group](docs/deploy_existing.md#resource-group).
  - Your Azure account also needs `Microsoft.Resources/deployments/write` permissions on the subscription level.

#### Cost estimation

See the [cost estimation](./docs/cost.md) details for running this sample on Azure.

### Purview API Integration

As part of the Purview API integration, the app must first authenticate with Microsoft Entra ID, and then acquire a Purview Graph token. This token enables Purview policies to be enforced for both the user and the application. Based on the applicable policy, the app will invoke the appropriate APIs.

The sections below explain the manual steps required to set up the Entra app registrations needed to obtain the token. These app registration details will later be used during deployment to configure the sample.

#### Register the backend app (backend-node-api)

1. Navigate to the [Microsoft Entra admin center](https://entra.microsoft.com) and select the **Microsoft Entra ID** service.
1. Select the **App Registrations** blade on the left, then select **New registration**.
1. In the **Register an application page** that appears, enter your application's registration information:
   1. In the **Name** section, enter a meaningful application name that will be displayed to users of the app, for example `backend-node-api`.
   1. Under **Supported account types**, select **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)**
   1. Select **Register** to create the application.
1. In the **Overview** blade, find and note the **Application (client) ID**. You use this value later while deploying this sample through `azd command`.
1. In the app's registration screen, select the **Expose an API** blade to the left to open the page where you can publish the permission as an API for which client applications can obtain [access tokens](https://aka.ms/access-tokens) for. The first thing that we need to do is to declare the unique [resource](https://docs.microsoft.com/azure/active-directory/develop/v2-oauth2-auth-code-flow) URI that the clients will be using to obtain access tokens for this API. To declare an resource URI(Application ID URI), follow the following steps:
   1. Select **Set** next to the **Application ID URI** to generate a URI that is unique for this app.
   1. For this sample, accept the proposed Application ID URI (`api://{clientId}`) by selecting **Save**.
      > :information_source: Read more about Application ID URI at [Validation differences by supported account types (signInAudience)](https://docs.microsoft.com/azure/active-directory/develop/supported-accounts-validation).

##### Publish Delegated Permissions

1. All APIs must publish a minimum of one [scope](https://docs.microsoft.com/azure/active-directory/develop/v2-oauth2-auth-code-flow#request-an-authorization-code), also called [Delegated Permission](https://docs.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent#permission-types), for the client apps to obtain an access token for a _user_ successfully. To publish a scope, follow these steps:
1. Select **Add a scope** button open the **Add a scope** screen and Enter the values as indicated below:
   1. For **Scope name**, use `access_as_user`.
   1. Select **Admins and users** options for **Who can consent?**.
   1. For **Admin consent display name** type in _access_as_user_.
   1. For **Admin consent description** type in _e.g. Allows the app to get LLM response._.
   1. For **User consent display name** type in _scopeName_.
   1. For **User consent description** type in _eg. Allows the app to get LLM response._.
   1. Keep **State** as **Enabled**.
   1. Select the **Add scope** button on the bottom to save this scope.

> :information_source: Follow [the principle of least privilege when publishing permissions](https://learn.microsoft.com/security/zero-trust/develop/protected-api-example) for a web API.

1. From the **Certificates & secrets** page, in the **Client secrets** section, choose **New client secret**:

   - Type a key description (of instance `app secret`),
   - Select a key duration of either **In 1 year**, **In 2 years**, or **Never Expires**.
   - When you press the **Add** button, the key value will be displayed, copy, and save the value in a safe location.
   - You'll need this key later to during the package deployment through `azd up` command. . This key value will not be displayed again, nor retrievable by any other means,
     so record it as soon as it is visible from the Azure portal.

##### Configure/grant the service app (backend-node-api) permissions to invoke the Purview API

> In the steps below, "ClientID" is the same as "Application ID" or "AppId".

1. Consuruct the below URL and replace the `<CLIENT_ID>` by the app registration id of the backend app

```url
https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=%3CCLIENT_ID%3E&scope=Content.Process.User%20ProtectionScopes.Compute.User%20ContentActivity.Write%20SensitivityLabel.Read
```

1. Find the key `Enter_the_Application_Id_Here` and replace the existing value with the application ID (clientId) of `msal-node-api` app copied from the Microsoft Entra admin center.
1. Find the key `Enter_the_Tenant_Info_Here` and replace the existing value with your Microsoft Entra tenant/directory ID.

#### Register the client app (front-end-javascript-spa)

1. Navigate to the [Microsoft Entra admin center](https://entra.microsoft.com) and select the **Microsoft Entra ID** service.
1. Select the **App Registrations** blade on the left, then select **New registration**.
1. In the **Register an application page** that appears, enter your application's registration information:
   1. In the **Name** section, enter a meaningful application name that will be displayed to users of the app, for example `msal-javascript-spa`.
   1. Under **Supported account types**, select **Accounts in this organizational directory only**
   1. Select **Register** to create the application.
1. In the **Overview** blade, find and note the **Application (client) ID**. You use this value in your app's configuration file(s) later in your code.
1. In the app's registration screen, select the **Authentication** blade to the left.
1. If you don't have a platform added, select **Add a platform** and select the **Single-page application** option.
   1. In the **Redirect URI** section enter the following redirect URIs:
      1. `http://localhost:8000`
   1. Click **Save** to save your changes.
1. Since this app signs-in users, we will now proceed to select **delegated permissions**, which is is required by apps signing-in users.
   1. In the app's registration screen, select the **API permissions** blade in the left to open the page where we add access to the APIs that your application needs:
   1. Select the **Add a permission** button and then:
   1. Ensure that the **My APIs** tab is selected.
   1. In the list of APIs, select the API `backend-node-api`.
   1. In the **Delegated permissions** section, select **access_as_user** in the list. Use the search box if necessary.
   1. Select the **Add permissions** button at the bottom.

##### Configure the client app (front-end-javascript-spa) to use your app registration

Open the project in your IDE (like VVisual Studio Code) to configure the code.

> In the steps below, "ClientID" is the same as "Application ID" or "AppId" \

1. Navigate to the packages->webapp folderand create a new file called `.env` andd insert the below information.
1. "<CLIENT_ID>" should be replaced by the appid of the front-end app registration.
1. "<API_ID>" should be replaced by the appid of the backned-end app registration.

```env
VITE_AZURE_AD_CLIENT_ID="<CLIENT_ID>"
VITE_AZURE_AD_AUTHORITY_HOST="https://login.microsoftonline.com/organizations"
VITE_BACKEND_API_SCOPE="api://<API_ID>/access_as_user"
```

### Deploy the sample

1. Open a terminal and navigate to the root of the project.
2. Authenticate with Azure by running `azd auth login`.
3. Run `azd up` to deploy the application to Azure. This will provision Azure resources, deploy this sample, and build the search index based on the files found in the `./data` folder.
   - You will be prompted to select a base location for the resources. If you're unsure of which location to choose, select `eastus2`.
   - By default, the OpenAI resource will be deployed to `eastus2`. You can set a different location with `azd env set AZURE_OPENAI_RESOURCE_GROUP_LOCATION <location>`. Currently only a short list of locations is accepted. That location list is based on the [OpenAI model availability table](https://learn.microsoft.com/azure/ai-services/openai/concepts/models#standard-deployment-model-availability) and may become outdated as availability changes.
   - You will be prompted to insert the app id of the backend app registration followed by the secret that yuu have created in the app registration step.

The deployment process will take a few minutes. Once it's done, you'll see the URL of the web app in the terminal.

<div align="center">
  <img src="./docs/images/azd-up.png" alt="Screenshot of the azd up command result" width="600px" />
</div>

### Note on Redirect URI Error

> **Note**: When you run the application for the first time, you may encounter a **Redirect URI error**. This happens because the web app URL is not yet registered as a redirect URI in the front-end app registration.  
> To resolve this:
>
> 1. Copy the web app URL displayed in the terminal after deployment (e.g., `https://<your-webapp-name>.azurestaticapps.net`).
> 2. Navigate to the **Microsoft Entra admin center** ([https://entra.microsoft.com](https://entra.microsoft.com)).
> 3. Select your **front-end app registration**.
> 4. Go to the **Authentication** blade and update the **Redirect URI** under the **Single-page application (SPA)** section with the web app URL.
> 5. Save the changes and retry accessing the application.

You can now open the web app in your browser and start chatting with the bot.

##### Enhance security

When deploying the sample in an enterprise context, you may want to enforce tighter security restrictions to protect your data and resources. See the [enhance security](./docs/enhance-security.md) guide for more information.

#### Clean up

To clean up all the Azure resources created by this sample:

1. Run `azd down --purge`
2. When asked if you are sure you want to continue, enter `y`

The resource group and all the resources will be deleted.

### Run the sample locally with Ollama

If you have a machine with enough resources, you can run this sample entirely locally without using any cloud resources. To do that, you first have to install [Ollama](https://ollama.com) and then run the following commands to download the models on your machine:

```bash
ollama pull llama3.1:latest
ollama pull nomic-embed-text:latest
```

> [!NOTE]
> The `llama3.1` model with download a few gigabytes of data, so it can take some time depending on your internet connection.

After that you have to install the NPM dependencies:

```bash
npm install
```

Then you can start the application by running the following command which will start the web app and the API locally:

```bash
npm start
```

Then, open a new terminal running concurrently and run the following command to upload the PDF documents from the `/data` folder to the API:

```bash
npm run upload:docs
```

This only has to be done once, unless you want to add more documents.

You can now open the URL `http://localhost:8000` in your browser to start chatting with the bot.

> [!NOTE]
> While local models usually works well enough to answer the questions, sometimes they may not be able to follow perfectly the advanced formatting instructions for the citations and follow-up questions. This is expected, and a limitation of using smaller local models.

### Run the sample locally with Azure OpenAI models

First you need to provision the Azure resources needed to run the sample. Follow the instructions in the [Deploy the sample to Azure](#deploy-the-sample-to-azure) section to deploy the sample to Azure, then you'll be able to run the sample locally using the deployed Azure resources.

Once your deployment is complete, you should see a `.env` file in the `packages/api` folder. This file contains the environment variables needed to run the application using Azure resources.

To run the sample, you can then use the same commands as for the Ollama setup. This will start the web app and the API locally:

```bash
npm start
```

Open the URL `http://localhost:8000` in your browser to start chatting with the bot.

Note that the documents are uploaded automatically when deploying the sample to Azure with `azd up`.

> [!TIP]
> You can switch back to using Ollama models by simply deleting the `packages/api/.env` file and starting the application again. To regenerate the `.env` file, you can run `azd env get-values > packages/api/.env`.

## Resources

Here are some resources to learn more about the technologies used in this sample:

- [LangChain.js documentation](https://js.langchain.com)
- [Generative AI with JavaScript](https://github.com/microsoft/generative-ai-with-javascript)
- [Generative AI For Beginners](https://github.com/microsoft/generative-ai-for-beginners)
- [Azure OpenAI Service](https://learn.microsoft.com/azure/ai-services/openai/overview)
- [Azure Cosmos DB for NoSQL](https://learn.microsoft.com/azure/cosmos-db/nosql/)
- [Ask YouTube: LangChain.js + Azure Quickstart sample](https://github.com/Azure-Samples/langchainjs-quickstart-demo)
- [Chat + Enterprise data with Azure OpenAI and Azure AI Search](https://github.com/Azure-Samples/azure-search-openai-javascript)
- [Revolutionize your Enterprise Data with Chat: Next-gen Apps w/ Azure OpenAI and AI Search](https://aka.ms/entgptsearchblog)

You can also find [more Azure AI samples here](https://github.com/Azure-Samples/azureai-samples).

## FAQ

You can find answers to frequently asked questions in the [FAQ](./docs/faq.md).

## Troubleshooting

If you have any issue when running or deploying this sample, please check the [troubleshooting guide](./docs/troubleshooting.md). If you can't find a solution to your problem, please [open an issue](https://github.com/Azure-Samples/serverless-chat-langchainjs/issues) in this repository.

## Guidance

For more detailed guidance on how to use this sample, please refer to the [tutorial](./docs/tutorial/01-introduction.md).

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
