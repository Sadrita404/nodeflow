import { Aptos, AptosConfig, Network, AccountAddress, Serializer } from '@aptos-labs/ts-sdk';
import { Network as AppNetwork } from '@/store/workflowStore';
import { signAndSubmitTransaction, WalletAccount } from './walletService';

export interface DeploymentResult {
  success: boolean;
  contractAddress?: string;
  transactionHash?: string;
  error?: string;
}

export interface WalletConnection {
  address: string;
  account: WalletAccount;
  aptosClient: Aptos;
}

// Initialize Aptos client for testnet with API key support
// API keys help avoid rate limiting - get yours at https://geomi.dev/docs/start
// Add NEXT_PUBLIC_APTOS_API_KEY to your .env file for client-side usage
// Or APTOS_API_KEY for server-side usage
const getAptosConfig = () => {
  // Check for API key in environment variables
  // NEXT_PUBLIC_ prefix makes it available on client-side
  const apiKey = typeof window !== 'undefined' 
    ? process.env.NEXT_PUBLIC_APTOS_API_KEY 
    : process.env.APTOS_API_KEY || process.env.NEXT_PUBLIC_APTOS_API_KEY;
  
  const configOptions: any = { 
    network: Network.TESTNET,
  };
  
  // Add API key to clientConfig headers if available
  // Aptos API keys are passed via headers in the clientConfig
  if (apiKey) {
    configOptions.clientConfig = {
      HEADERS: {
        'Authorization': `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
    };
    configOptions.fullnodeConfig = {
      HEADERS: {
        'Authorization': `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
    };
    console.log('BlockchainService - Using Aptos API key for rate limit protection');
  } else {
    console.warn('BlockchainService - No Aptos API key found. You may hit rate limits.');
    console.warn('BlockchainService - Get an API key at https://geomi.dev/docs/start');
    console.warn('BlockchainService - Add NEXT_PUBLIC_APTOS_API_KEY to your .env file');
  }
  
  return new AptosConfig(configOptions);
};

const aptosConfig = getAptosConfig();
const aptosClient = new Aptos(aptosConfig);

export async function connectWallet(): Promise<WalletConnection | null> {
  const { connectWallet: connectWalletService, getCurrentAccount } = await import('./walletService');
  
  try {
    // Connect wallet using wallet service
    const account = await connectWalletService();

    return {
      address: account.address,
      account,
      aptosClient,
    };
  } catch (error: any) {
    console.error('Failed to connect wallet:', error);
    throw new Error(error.message || 'Failed to connect wallet');
  }
}

export async function switchNetwork(): Promise<boolean> {
  // Aptos wallets handle network switching automatically
  // For testnet, we just ensure we're using the testnet client
  return true;
}

export async function addNetwork(network: AppNetwork): Promise<boolean> {
  // Aptos wallets don't require manual network addition like EVM wallets
  // Network is determined by the wallet configuration
  return true;
}

/**
 * Deploy a Move module with proper transaction signing using wallet service
 */
export async function deployContract(
  moduleBytecode: string,
  moduleName: string,
  constructorArgs: any[] = [],
  account: WalletAccount,
  metadataBytes?: string // Optional: metadata bytes from compilation
): Promise<DeploymentResult> {
  try {
    // CRITICAL: Log the incoming bytecode to debug
    console.log('deployContract called with:', {
      moduleBytecodeType: typeof moduleBytecode,
      moduleBytecodeLength: moduleBytecode?.length,
      moduleBytecodePreview: typeof moduleBytecode === 'string' ? moduleBytecode.substring(0, 100) : 'Not a string',
      moduleName,
    });

    // Validate inputs
    if (!moduleBytecode || moduleBytecode.length === 0) {
      console.error('deployContract - moduleBytecode is empty or undefined');
      return {
        success: false,
        error: 'Module bytecode is required for deployment',
      };
    }

    // Check if bytecode is just "0x" with no content
    if (moduleBytecode === '0x' || (moduleBytecode.startsWith('0x') && moduleBytecode.length === 2)) {
      console.error('deployContract - moduleBytecode is just "0x" with no content');
      return {
        success: false,
        error: 'Bytecode is empty (only "0x" prefix found). Please ensure compilation completed successfully and bytecode was generated.',
      };
    }

    if (!moduleName) {
      return {
        success: false,
        error: 'Module name is required for deployment',
      };
    }

    if (!account || !account.address) {
      return {
        success: false,
        error: 'Wallet account is required for deployment',
      };
    }

    // Convert bytecode from hex string to Uint8Array if needed
    let bytecodeBytes: Uint8Array;
    if (typeof moduleBytecode === 'string') {
      // Remove 0x prefix if present
      const cleanHex = moduleBytecode.startsWith('0x') ? moduleBytecode.slice(2) : moduleBytecode;
      
      // Check if hex string is empty
      if (!cleanHex || cleanHex.length === 0) {
        return {
          success: false,
          error: 'Bytecode is empty. Please ensure the contract was compiled successfully.',
        };
      }
      
      // Validate hex string
      if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
        return {
          success: false,
          error: `Invalid bytecode format. Expected hex string. Got: ${moduleBytecode.substring(0, 50)}...`,
        };
      }
      
      bytecodeBytes = Uint8Array.from(Buffer.from(cleanHex, 'hex'));
    } else if (moduleBytecode && ArrayBuffer.isView(moduleBytecode)) {
      bytecodeBytes = new Uint8Array(moduleBytecode);
    } else {
      return {
        success: false,
        error: `Invalid bytecode type. Expected string or Uint8Array. Got: ${typeof moduleBytecode}`,
      };
    }

    if (bytecodeBytes.length === 0) {
      return {
        success: false,
        error: 'Bytecode is empty. Please ensure the contract was compiled successfully.',
      };
    }

    // Get account address
    const accountAddress = AccountAddress.fromString(account.address);

    // Convert bytecode to hex string for the API
    const bytecodeHex = Array.from(bytecodeBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const bytecodeHexString = '0x' + bytecodeHex;

    // Validate the final hex string
    if (!bytecodeHexString || bytecodeHexString === '0x' || bytecodeHexString.length < 3) {
      console.error('BlockchainService - Invalid bytecode hex string:', {
        length: bytecodeHexString?.length,
        value: bytecodeHexString?.substring(0, 100),
        originalBytecode: typeof moduleBytecode === 'string' ? moduleBytecode.substring(0, 100) : 'Uint8Array',
        bytecodeBytesLength: bytecodeBytes.length,
      });
      return {
        success: false,
        error: `Invalid bytecode hex string. Length: ${bytecodeHexString?.length || 0}, Value: ${bytecodeHexString?.substring(0, 100) || 'undefined'}`,
      };
    }

    // Additional validation: ensure hex string has actual content after 0x
    const hexContent = bytecodeHexString.slice(2); // Remove '0x' prefix
    if (!hexContent || hexContent.length === 0 || !/^[0-9a-fA-F]+$/.test(hexContent)) {
      console.error('BlockchainService - Invalid hex content:', {
        hexString: bytecodeHexString.substring(0, 100),
        hexContent: hexContent?.substring(0, 100),
        bytecodeBytesLength: bytecodeBytes.length,
      });
      return {
        success: false,
        error: `Invalid hex content in bytecode string. Hex content length: ${hexContent?.length || 0}`,
      };
    }

    console.log('BlockchainService - Deploying with bytecode:', {
      hexStringLength: bytecodeHexString.length,
      hexContentLength: hexContent.length,
      preview: bytecodeHexString.substring(0, 50) + '...',
      originalBytecodeInput: typeof moduleBytecode === 'string' ? moduleBytecode.substring(0, 100) : 'Uint8Array',
      bytecodeBytesLength: bytecodeBytes.length,
    });

    // FINAL VALIDATION: Ensure bytecodeHexString has actual content
    // This is the last check before the SDK call
    if (bytecodeHexString === '0x' || hexContent.length === 0) {
      console.error('BlockchainService - CRITICAL: Bytecode is empty before API call!', {
        bytecodeHexString,
        hexContent,
        originalInput: moduleBytecode,
        bytecodeBytesLength: bytecodeBytes.length,
        bytecodeBytes: Array.from(bytecodeBytes).slice(0, 10),
      });
      return {
        success: false,
        error: 'Bytecode is empty. The compiled bytecode appears to be invalid. Please recompile the contract.',
      };
    }

    // FINAL VALIDATION: Ensure bytecodeHexString is valid before passing to SDK
    // This check happens right before the API call to catch any edge cases
    if (!bytecodeHexString || bytecodeHexString.length <= 2 || bytecodeHexString === '0x') {
      console.error('BlockchainService - CRITICAL: Bytecode validation failed right before API call!', {
        bytecodeHexString,
        hexContent,
        originalInput: typeof moduleBytecode === 'string' ? moduleBytecode.substring(0, 100) : 'Uint8Array',
        bytecodeBytesLength: bytecodeBytes.length,
      });
      return {
        success: false,
        error: 'Bytecode is empty or invalid. The compiled bytecode appears to be empty. Please recompile the contract.',
      };
    }

    // Build the transaction to publish the module
    // Package metadata structure: { name: vector<u8>, upgrade_policy: u8 }
    // Prefer metadata from compilation if available (generated by Aptos CLI with --save-metadata)
    // Otherwise, create empty metadata manually using SDK Serializer
    let finalMetadataBytes: Uint8Array;
    
    if (metadataBytes && metadataBytes.startsWith('0x')) {
      // Use metadata from compilation (generated by Aptos CLI)
      const cleanHex = metadataBytes.slice(2);
      finalMetadataBytes = new Uint8Array(
        cleanHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );
      console.log('BlockchainService - Using metadata from compilation:', {
        metadataHex: metadataBytes.substring(0, 50) + '...',
        metadataLength: finalMetadataBytes.length,
      });
    } else {
      // Generate empty metadata manually using SDK Serializer
      // According to Aptos Move code, metadata is BCS-encoded as:
      // - name: vector<u8> - serialized using serializeBytes (which handles ULEB128 length)
      // - upgrade_policy: u8 (0 = compatible, 1 = immutable, 2 = arbitrary)
      const serializer = new Serializer();
      
      // Serialize metadata structure using proper BCS encoding:
      // 1. name: vector<u8> - serialize empty vector using serializeBytes
      //    serializeBytes handles the ULEB128 length encoding automatically
      serializer.serializeBytes(new Uint8Array(0)); // Empty vector - serializeBytes handles length encoding
      // 2. upgrade_policy: u8 - serialize as u8 (0 = compatible)
      serializer.serializeU8(0); // Upgrade policy: 0 = compatible
      
      finalMetadataBytes = serializer.toUint8Array();
      console.log('BlockchainService - Generated empty metadata manually:', {
        metadataLength: finalMetadataBytes.length,
        metadataArray: Array.from(finalMetadataBytes),
      });
    }
    
    const metadataHexString = '0x' + Array.from(finalMetadataBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('BlockchainService - Creating transaction with:', {
      bytecodeLength: bytecodeHexString.length,
      bytecodePreview: bytecodeHexString.substring(0, 50) + '...',
      metadataBytes: metadataHexString,
      metadataBytesLength: finalMetadataBytes.length,
      metadataSource: metadataBytes ? 'compilation' : 'manual',
    });

    // Create transaction using SDK
    // Note: publishPackageTransaction returns a UserTransaction object
    // Use metadata bytes (either from compilation or manually generated)
    const transaction = await aptosClient.publishPackageTransaction({
      account: accountAddress,
      moduleBytecode: [bytecodeHexString],
      metadataBytes: finalMetadataBytes, // Use metadata from compilation or manually generated
    });

    console.log('BlockchainService - Transaction created:', {
      transactionType: transaction.constructor?.name,
      transactionKeys: Object.keys(transaction),
      hasRawTransaction: 'rawTransaction' in transaction,
      hasTransactionInput: 'transactionInput' in transaction,
      hasToJSON: typeof (transaction as any).toJSON === 'function',
    });
    console.log('BlockchainService - Transaction object:', transaction);

    if (!transaction) {
      return {
        success: false,
        error: 'Failed to create transaction. Please try again.',
      };
    }

    // Petra wallet's signAndSubmitTransaction expects the transaction object
    // The dark window issue is a known Petra wallet bug with package publishing transactions
    // Try multiple approaches to work around this issue
    
    let transactionToSign: any = transaction;
    
    // Try to get rawTransaction if available (some SDK versions expose this)
    if ('rawTransaction' in transaction && (transaction as any).rawTransaction) {
      console.log('BlockchainService - Found rawTransaction, trying that format');
      transactionToSign = (transaction as any).rawTransaction;
    } else if (typeof (transaction as any).toJSON === 'function') {
      // Try serializing to JSON and back (Petra might need plain object)
      try {
        console.log('BlockchainService - Transaction has toJSON, trying serialized format');
        const serialized = (transaction as any).toJSON();
        transactionToSign = serialized;
      } catch (e) {
        console.warn('BlockchainService - Failed to serialize transaction:', e);
        // Fall back to original
      }
    }
    
    console.log('BlockchainService - Calling wallet signAndSubmitTransaction...');
    console.log('BlockchainService - Transaction type:', typeof transactionToSign);
    console.log('BlockchainService - Transaction constructor:', transactionToSign?.constructor?.name);
    console.log('BlockchainService - NOTE: If Petra window is dark, this is a known Petra wallet bug.');
    console.log('BlockchainService - Workaround: Close the dark window and try again, or update Petra wallet.');
    
    // Pass transaction to Petra wallet
    // If window is dark, this is a known Petra wallet issue - user should close and retry
    const pendingTxn = await signAndSubmitTransaction(transactionToSign);

    if (!pendingTxn || !pendingTxn.hash) {
      return {
        success: false,
        error: 'Transaction signing failed. Please check the console for details.',
      };
    }

    // Wait for transaction to be executed
    const executedTxn = await aptosClient.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    // Check if transaction was successful
    if (executedTxn && executedTxn.success !== false) {
      return {
        success: true,
        contractAddress: account.address, // Module is deployed to the account
        transactionHash: pendingTxn.hash,
      };
    }
    
    return {
      success: false,
      error: 'Transaction execution failed. Please check the console for details.',
    };
  } catch (error: any) {
    console.error('Deployment error:', error);
    
    // Provide more specific error messages
    let errorMessage = error.message || 'Failed to deploy contract';
    
    if (error.message?.includes('User rejected') || error.message?.includes('rejected')) {
      errorMessage = 'Transaction was rejected by user';
    } else if (error.message?.includes('insufficient')) {
      errorMessage = 'Insufficient balance to pay for transaction fees';
    } else if (error.message?.includes('invalid')) {
      errorMessage = 'Invalid transaction or bytecode format';
    } else if (error.message?.includes('not connected')) {
      errorMessage = 'Wallet is not connected. Please connect your wallet first.';
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function getBalance(address: string): Promise<string> {
  try {
    const accountAddress = AccountAddress.fromString(address);
    const resources = await aptosClient.getAccountResources({ accountAddress });
    const accountResource = resources.find((r: any) => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
    
    if (accountResource) {
      const balance = (accountResource.data as any).coin.value;
      // Convert from smallest unit (octas) to APT
      return (BigInt(balance) / BigInt(100000000)).toString();
    }
    return '0';
  } catch (error: any) {
    console.error('Failed to get balance:', error);
    throw new Error(error.message || 'Failed to get balance');
  }
}

export async function waitForTransaction(
  txHash: string
): Promise<any | null> {
  try {
    const transaction = await aptosClient.waitForTransaction({
      transactionHash: txHash,
    });
    return transaction;
  } catch (error: any) {
    console.error('Failed to wait for transaction:', error);
    throw new Error(error.message || 'Failed to wait for transaction');
  }
}

export function getExplorerUrl(network: AppNetwork, address: string, type: 'address' | 'tx' = 'address'): string | null {
  if (!network.explorer) return null;

  if (type === 'tx') {
    return `${network.explorer}/txn/${address}`;
  }
  return `${network.explorer}/account/${address}`;
}

export async function estimateGas(
  moduleBytecode: string | Uint8Array,
  moduleName: string,
  constructorArgs: any[] = [],
  account: WalletAccount
): Promise<bigint> {
  try {
    // Aptos uses a different gas model
    // For simplicity, return a fixed estimate based on bytecode size
    let bytecodeSize: number;
    if (typeof moduleBytecode === 'string') {
      bytecodeSize = (moduleBytecode.startsWith('0x') ? moduleBytecode.slice(2) : moduleBytecode).length / 2;
    } else {
      bytecodeSize = (moduleBytecode as Uint8Array).length;
    }
    
    // Base gas + size-based gas
    const baseGas = 100000;
    const sizeGas = bytecodeSize * 10;
    return BigInt(baseGas + sizeGas);
  } catch (error: any) {
    console.error('Failed to estimate gas:', error);
    throw new Error(error.message || 'Failed to estimate gas');
  }
}
