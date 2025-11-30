/**
 * Wallet Service - Direct Petra wallet integration
 * Uses window.aptos API directly for reliable connection
 */

export interface WalletAccount {
  address: string;
  publicKey?: string;
}

export interface WalletConnection {
  account: WalletAccount;
  isConnected: boolean;
}

declare global {
  interface Window {
    aptos?: {
      connect: () => Promise<{ address: string }>;
      account: () => Promise<WalletAccount | null>;
      disconnect: () => Promise<void>;
      signAndSubmitTransaction: (transaction: any) => Promise<{ hash: string }>;
      onAccountChange?: (callback: (account: WalletAccount | null) => void) => void;
      onDisconnect?: (callback: () => void) => void;
    };
  }
}

/**
 * Check if Petra wallet is installed
 */
export function isWalletInstalled(): boolean {
  return typeof window !== 'undefined' && typeof window.aptos !== 'undefined';
}

/**
 * Connect to Petra wallet
 */
export async function connectWallet(): Promise<WalletAccount> {
  if (!isWalletInstalled()) {
    throw new Error('Petra wallet is not installed. Please install Petra wallet to continue.');
  }

  try {
    // Request connection
    const connectResult = await window.aptos!.connect();
    
    // Verify we got a response
    if (!connectResult) {
      throw new Error('Connection request returned no result');
    }

    // Get account after connection
    const account = await window.aptos!.account();
    
    if (!account || !account.address) {
      // Clear any stale localStorage data
      localStorage.removeItem('walletAddress');
      throw new Error('Failed to get account from wallet after connection');
    }

    // Save to localStorage for workflow executor
    localStorage.setItem('walletAddress', account.address);

    return {
      address: account.address,
      publicKey: account.publicKey,
    };
  } catch (error: any) {
    // Clear localStorage on connection failure
    localStorage.removeItem('walletAddress');
    
    if (error.code === 4001) {
      throw new Error('User rejected the connection request');
    }
    
    // Provide more specific error messages
    if (error.message?.includes('rejected')) {
      throw new Error('Connection was rejected. Please try again.');
    }
    
    if (error.message?.includes('timeout') || error.message?.includes('time')) {
      throw new Error('Connection timeout. Please ensure Petra wallet is unlocked.');
    }
    
    throw new Error(error.message || 'Failed to connect wallet. Please try again.');
  }
}

/**
 * Get current connected account
 * More robust implementation that tries multiple methods
 */
export async function getCurrentAccount(): Promise<WalletAccount | null> {
  // Check localStorage first (fastest, no wallet API call needed)
  if (typeof window !== 'undefined') {
    const savedAddress = localStorage.getItem('walletAddress');
    if (savedAddress && isValidAddress(savedAddress)) {
      // If wallet is installed, try to verify it's still valid
      if (isWalletInstalled() && window.aptos) {
        try {
          // Quick check with timeout
          const accountPromise = window.aptos.account();
          const timeoutPromise = new Promise<null>((resolve) => 
            setTimeout(() => resolve(null), 500)
          );
          
          const account = await Promise.race([accountPromise, timeoutPromise]);
          if (account && account.address === savedAddress) {
            return {
              address: account.address,
              publicKey: account.publicKey,
            };
          }
        } catch (error) {
          // If verification fails, return saved address anyway
          // Workflow executor can use it for compilation
        }
      }
      
      // Return saved address even if wallet check fails
      return {
        address: savedAddress,
      };
    }
  }

  // If no saved address, try to get from wallet
  if (!isWalletInstalled()) {
    return null;
  }

  try {
    // Direct method: Try to get account with timeout
    const accountPromise = window.aptos!.account();
    const timeoutPromise = new Promise<null>((resolve) => 
      setTimeout(() => resolve(null), 1000)
    );
    
    const account = await Promise.race([accountPromise, timeoutPromise]);
    
    if (account && account.address) {
      // Save to localStorage for future use
      localStorage.setItem('walletAddress', account.address);
      return {
        address: account.address,
        publicKey: account.publicKey,
      };
    }
  } catch (error: any) {
    // If account() throws, return null
    console.debug('Could not get current account:', error.message || error);
  }

  return null;
}

/**
 * Disconnect wallet
 */
export async function disconnectWallet(): Promise<void> {
  if (typeof window !== 'undefined' && window.aptos) {
    try {
      await window.aptos.disconnect();
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  }
  localStorage.removeItem('walletAddress');
}

/**
 * Sign and submit a transaction
 */
export async function signAndSubmitTransaction(
  transaction: any
): Promise<{ hash: string }> {
  if (!isWalletInstalled()) {
    throw new Error('Wallet is not installed');
  }

  const account = await getCurrentAccount();
  if (!account) {
    throw new Error('Wallet is not connected. Please connect your wallet first.');
  }

  try {
    // Log transaction details before sending to wallet
    // Note: Cannot use JSON.stringify because transaction may contain BigInt values
    console.log('WalletService - signAndSubmitTransaction called with:', {
      transactionType: typeof transaction,
      transactionKeys: transaction ? Object.keys(transaction) : 'null',
      hasRawTransaction: transaction && 'rawTransaction' in transaction,
    });
    // Log transaction object directly (console.log handles BigInt fine)
    console.log('WalletService - Transaction object:', transaction);

    // Ensure wallet is still connected
    const currentAccount = await getCurrentAccount();
    if (!currentAccount) {
      throw new Error('Wallet disconnected. Please reconnect your wallet.');
    }

    console.log('WalletService - Calling window.aptos.signAndSubmitTransaction...');
    console.log('WalletService - Wallet account:', currentAccount.address);
    console.log('WalletService - Transaction being passed:', {
      type: typeof transaction,
      constructor: transaction?.constructor?.name,
      keys: transaction ? Object.keys(transaction).slice(0, 10) : [],
      hasRawTransaction: transaction && 'rawTransaction' in transaction,
    });
    
    // Call Petra wallet's signAndSubmitTransaction
    // NOTE: If Petra wallet window opens but is dark/blank, this is a known issue with Petra wallet
    // Possible causes:
    // 1. Petra wallet UI bug with package publishing transactions
    // 2. Transaction format compatibility issue
    // 3. Petra wallet version needs update
    // 
    // Troubleshooting steps:
    // - Check browser console for Petra-specific errors
    // - Try updating Petra wallet extension
    // - Check Petra wallet GitHub issues: https://github.com/aptos-labs/petra-wallet
    // - Try refreshing the page and reconnecting wallet
    
    // Add a timeout to detect if wallet is hanging
    // Also wrap in try-catch to catch any immediate errors from Petra
    let transactionPromise: Promise<{ hash: string }>;
    try {
      console.log('WalletService - Calling Petra wallet signAndSubmitTransaction...');
      console.log('WalletService - If window is dark, check browser console for Petra errors');
      transactionPromise = window.aptos!.signAndSubmitTransaction(transaction);
    } catch (error: any) {
      console.error('WalletService - Immediate error from Petra wallet:', error);
      console.error('WalletService - Error details:', {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack?.substring(0, 200),
      });
      throw new Error(`Petra wallet error: ${error.message || 'Unknown error'}. If window is dark, this may be a Petra wallet bug.`);
    }
    
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Transaction signing timeout after 60 seconds - Petra wallet window may be stuck or unresponsive. Try closing the dark window and retrying.')), 60000)
    );
    
    const result = await Promise.race([transactionPromise, timeoutPromise]);
    
    console.log('WalletService - Transaction signed and submitted:', {
      hash: result?.hash,
      resultKeys: result ? Object.keys(result) : 'null',
    });
    
    if (!result || !result.hash) {
      throw new Error('Transaction signing failed - no hash returned');
    }

    return result;
  } catch (error: any) {
    console.error('WalletService - signAndSubmitTransaction error:', {
      error: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack?.substring(0, 500),
    });

    // Handle specific error cases
    if (error.code === 4001) {
      throw new Error('User rejected the transaction');
    }
    if (error.message?.includes('insufficient')) {
      throw new Error('Insufficient balance to pay for transaction fees');
    }
    if (error.message?.includes('not connected') || error.message?.includes('disconnected')) {
      throw new Error('Wallet is not connected. Please reconnect your wallet.');
    }
    if (error.message?.includes('timeout')) {
      throw new Error('Transaction signing timed out. The Petra wallet window may be stuck. Please close the dark window and try again.');
    }
    
    // Check if error is related to dark window issue
    const errorMsg = error.message || '';
    if (errorMsg.includes('timeout') || errorMsg.includes('stuck') || errorMsg.includes('unresponsive')) {
      throw new Error('Petra wallet window appears to be stuck or unresponsive. Please close the dark window, refresh the page, and try again. If the issue persists, try updating Petra wallet to the latest version.');
    }
    
    throw new Error(error.message || 'Failed to sign and submit transaction. If you see a dark Petra wallet window, close it and try again.');
  }
}

/**
 * Setup wallet event listeners
 */
export function setupWalletListeners(
  onAccountChange?: (account: WalletAccount | null) => void,
  onDisconnect?: () => void
): () => void {
  if (!isWalletInstalled()) {
    return () => {};
  }

  if (onAccountChange && window.aptos!.onAccountChange) {
    window.aptos!.onAccountChange((account: any) => {
      if (account) {
        onAccountChange({
          address: account.address,
          publicKey: account.publicKey,
        });
        localStorage.setItem('walletAddress', account.address);
      } else {
        onAccountChange(null);
        localStorage.removeItem('walletAddress');
      }
    });
  }

  if (onDisconnect && window.aptos!.onDisconnect) {
    window.aptos!.onDisconnect(() => {
      onDisconnect();
      localStorage.removeItem('walletAddress');
    });
  }

  return () => {
    // Cleanup if needed
  };
}

/**
 * Format address for display
 */
export function formatAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
}

/**
 * Validate Aptos address format
 */
export function isValidAddress(address: string): boolean {
  if (!address) return false;
  // Aptos addresses are hex strings starting with 0x, 32-64 characters
  return /^0x[a-fA-F0-9]{1,64}$/.test(address);
}

/**
 * Hook-like function for React components
 * Returns wallet state that can be used in components
 */
export function useWalletService() {
  // This is a simplified version that works without React hooks
  // Components should call getCurrentAccount() directly or use state management
  return {
    account: null as WalletAccount | null,
    isConnected: false,
    connect: connectWallet,
    disconnect: disconnectWallet,
    signAndSubmitTransaction,
  };
}
