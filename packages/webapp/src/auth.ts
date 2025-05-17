import {
  PublicClientApplication,
  AuthenticationResult,
  AccountInfo,
  SilentRequest,
  InteractionRequiredAuthError,
} from '@azure/msal-browser';

const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_AD_CLIENT_ID, // Replace with your Azure AD App's Client ID
    authority: import.meta.env.VITE_AZURE_AD_AUTHORITY_HOST, // Replace with your Tenant ID
    redirectUri: window.location.origin,
  },
};

const msalInstance = new PublicClientApplication(msalConfig);

// Ensure MSAL is initialized before using it
async function initializeMsal() {
  try {
    await msalInstance.initialize();
  } catch (error) {
    console.error('Failed to initialize MSAL:', error);
    throw error;
  }
}

export async function signIn(): Promise<AccountInfo | null> {
  try {
    await initializeMsal(); // Ensure MSAL is initialized

    // Check for existing accounts in the cache
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      console.log('Using cached account:', accounts[0]);
      return accounts[0]; // Return the first cached account
    }

    // If no cached account, perform login
    const loginResponse: AuthenticationResult = await msalInstance.loginPopup({
      scopes: ['User.Read'], // Add required scopes
    });
    localStorage.setItem('msalToken', loginResponse.accessToken);
    return loginResponse.account;
  } catch (error) {
    console.error('Sign-in failed:', error);
    throw error;
  }
}

export async function acquireToken(): Promise<string | null> {
  try {
    await initializeMsal(); // Ensure MSAL is initialized
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) {
      console.warn('No accounts found in cache. User must sign in.');
      return null;
    }

    const silentRequest: SilentRequest = {
      account: accounts[0], // Use the first cached account
      scopes: [import.meta.env.VITE_BACKEND_API_SCOPE], // Add required scope
    };

    // Attempt to acquire token silently
    const tokenResponse = await msalInstance.acquireTokenSilent(silentRequest);
    return tokenResponse.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      console.warn('Interaction required. Prompting user to log in.');
      const tokenResponse = await msalInstance.acquireTokenPopup({
        scopes: ['api://72e39dca-38f3-4814-b93b-a7ed0a5a4b74/access_as_user'], // Add required scope
      });
      return tokenResponse.accessToken;
    }

    console.error('Failed to acquire token silently:', error);
    throw error;
  }
}

export function signOut(): void {
  msalInstance.logoutPopup();
  localStorage.removeItem('msalToken');
}

// Method to get the user ID (first part of homeAccountId before '.')
export function getUserId(): string | null {
  const accounts: AccountInfo[] = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    const { homeAccountId } = accounts[0]; // Use object destructuring
    const userId = homeAccountId.split('.')[0]; // Extract the first part before '.'
    return userId;
  }

  return null; // No user is signed in
}
