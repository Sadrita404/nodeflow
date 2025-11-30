/**
 * Production-Ready Move Contract Compiler
 * Uses backend API for compilation
 */

export interface CompilationResult {
  success: boolean;
  bytecode?: string;
  abi?: any; // Move ABI (different from Solidity ABI)
  errors?: string[];
  warnings?: string[];
}

/**
 * Compile a Move contract using the backend API
 * 
 * Move modules use named addresses (like "Deployer") which are mapped to actual
 * wallet addresses at compile time via Move.toml
 *
 * @param sourceCode - The Move source code to compile (should use "Deployer" as named address)
 * @param moduleName - The name of the module to compile
 * @param walletAddress - Required wallet address to map "Deployer" named address
 * @returns CompilationResult with bytecode and any errors/warnings
 */
export async function compileContract(
  sourceCode: string,
  moduleName: string,
  walletAddress: string
): Promise<CompilationResult> {
  try {
    // Validate wallet address is provided
    if (!walletAddress) {
      return {
        success: false,
        errors: [
          'Wallet address is required for compilation.',
          'Please connect your wallet before compiling.',
        ],
      };
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{1,64}$/.test(walletAddress)) {
      return {
        success: false,
        errors: ['Invalid wallet address format'],
      };
    }

    // Basic validation before sending to backend
    const validation = validateMoveCode(sourceCode);
    if (!validation.valid) {
      return {
        success: false,
        errors: [validation.message || 'Invalid Move code'],
      };
    }

    // Call the backend compilation API
    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceCode,
        moduleName,
        walletAddress, // Required: maps "Deployer" named address to actual address
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        errors: [errorData.errors?.[0] || `HTTP ${response.status}: ${response.statusText}`],
      };
    }

    const result: CompilationResult = await response.json();
    return result;

  } catch (error: any) {
    console.error('Compilation request failed:', error);
    return {
      success: false,
      errors: [
        'Failed to connect to compilation service',
        error.message || 'Unknown error occurred',
      ],
    };
  }
}

/**
 * Extract module name from Move source code
 * Looks for the main module definition
 * Format: module Deployer::<module_name>
 */
export function extractContractName(sourceCode: string): string | null {
  // Try to find the module definition
  // Format: module Deployer::<module_name>
  const moduleMatch = sourceCode.match(/module\s+\w+::(\w+)\s*\{/);
  if (moduleMatch) {
    return moduleMatch[1];
  }

  return null;
}

/**
 * Validate Move source code for basic correctness
 * Move modules should use "Deployer" as named address
 */
export function validateMoveCode(sourceCode: string): {
  valid: boolean;
  message?: string;
} {
  if (!sourceCode || sourceCode.trim().length === 0) {
    return {
      valid: false,
      message: 'Source code is empty'
    };
  }

  if (!sourceCode.includes('module')) {
    return {
      valid: false,
      message: 'Missing "module" declaration. Please specify a Move module.'
    };
  }

  // Check for module declaration - should use "Deployer" as named address
  const modulePattern = /module\s+(\w+)::\w+/;
  const match = sourceCode.match(modulePattern);
  if (!match) {
    return {
      valid: false,
      message: 'Invalid module declaration. Expected format: module Deployer::<module_name>'
    };
  }

  // Verify it uses "Deployer" as named address
  const namedAddress = match[1];
  if (namedAddress !== 'Deployer') {
    return {
      valid: false,
      message: `Module must use "Deployer" as named address. Found: ${namedAddress}`
    };
  }

  return { valid: true };
}

/**
 * Check if the compilation API is available
 */
export async function checkCompilerAvailability(): Promise<{
  available: boolean;
  version?: string;
  message?: string;
}> {
  try {
    const response = await fetch('/api/compile', {
      method: 'GET',
    });

    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        version: data.compilerVersion,
        message: 'Compilation service is ready',
      };
    }

    return {
      available: false,
      message: 'Compilation service is not responding',
    };
  } catch (error) {
    return {
      available: false,
      message: 'Cannot reach compilation service',
    };
  }
}

/**
 * Batch compile multiple contracts
 * Useful for contracts with dependencies
 */
export async function batchCompileContracts(
  contracts: Array<{ sourceCode: string; moduleName: string }>,
  walletAddress: string
): Promise<Map<string, CompilationResult>> {
  const results = new Map<string, CompilationResult>();

  for (const contract of contracts) {
    const result = await compileContract(
      contract.sourceCode,
      contract.moduleName,
      walletAddress
    );
    results.set(contract.moduleName, result);

    // If compilation fails, stop the batch
    if (!result.success) {
      break;
    }
  }

  return results;
}

/**
 * Get Move version from source code (if specified)
 */
export function extractMoveVersion(sourceCode: string): string | null {
  // Move doesn't have version pragmas like Solidity
  // But we can check for Move version comments or use default
  return '1.0'; // Default Move version
}

/**
 * Format compilation errors for user-friendly display
 */
export function formatCompilationErrors(errors: string[]): string {
  if (!errors || errors.length === 0) {
    return 'Unknown compilation error';
  }

  return errors
    .map((error, index) => {
      // Extract line numbers if present
      const lineMatch = error.match(/(\d+):(\d+):/);
      if (lineMatch) {
        return `Line ${lineMatch[1]}:${lineMatch[2]}\n${error}`;
      }
      return error;
    })
    .join('\n\n');
}

/**
 * Analyze bytecode size and provide warnings
 */
export function analyzeBytecodeSize(bytecode: string): {
  size: number;
  sizeKB: number;
  warning?: string;
} {
  // Remove 0x prefix if present
  const cleanBytecode = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
  const sizeBytes = cleanBytecode.length / 2; // Each byte is 2 hex characters
  const sizeKB = sizeBytes / 1024;

  let warning: string | undefined;

  // Aptos has different size limits
  if (sizeKB > 100) {
    warning = `Module size (${sizeKB.toFixed(2)}KB) is very large. Consider optimization.`;
  } else if (sizeKB > 50) {
    warning = `Module size (${sizeKB.toFixed(2)}KB) is moderately large.`;
  }

  return {
    size: sizeBytes,
    sizeKB: parseFloat(sizeKB.toFixed(2)),
    warning,
  };
}
