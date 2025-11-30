import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export const maxDuration = 180; // Maximum execution time in seconds (3 minutes - first run downloads dependencies, subsequent runs are faster)

interface CompileRequest {
  sourceCode: string;
  moduleName: string;
  walletAddress: string; // Required: wallet address to map "Deployer" named address
}

interface CompilationResult {
  success: boolean;
  bytecode?: string;
  metadataBytes?: string; // Package metadata bytes for deployment
  abi?: any;
  errors?: string[];
  warnings?: string[];
}

/**
 * POST /api/compile
 * Compiles Move source code using Aptos CLI and returns bytecode
 */
export async function POST(request: NextRequest) {
  let tempDir: string | null = null;
  
  try {
    const body: CompileRequest = await request.json();
    let { sourceCode, moduleName, walletAddress } = body;

    // Validate inputs
    if (!sourceCode || !moduleName || !walletAddress) {
      return NextResponse.json(
        {
          success: false,
          errors: ['Source code, module name, and wallet address are required'],
        },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{1,64}$/.test(walletAddress)) {
      return NextResponse.json({
        success: false,
        errors: ['Invalid wallet address format'],
      }, { status: 400 });
    }

    // Basic validation
    if (!sourceCode.includes('module')) {
      return NextResponse.json({
        success: false,
        errors: ['Invalid Move code: missing module declaration'],
      });
    }

    // Extract module declaration - should use "Deployer" as named address
    // Format: module Deployer::<module_name>
    const moduleMatch = sourceCode.match(/module\s+(\w+)::(\w+)\s*\{/);
    if (!moduleMatch) {
      return NextResponse.json({
        success: false,
        errors: ['Invalid module declaration. Expected format: module Deployer::<module_name>'],
      });
    }

    const namedAddress = moduleMatch[1];
    const extractedModuleName = moduleMatch[2];

    // Verify it uses "Deployer" as the named address
    if (namedAddress !== 'Deployer') {
      return NextResponse.json({
        success: false,
        errors: [`Module must use "Deployer" as named address. Found: ${namedAddress}`],
      });
    }

    if (extractedModuleName !== moduleName) {
      return NextResponse.json({
        success: false,
        errors: [`Module name mismatch. Found: ${extractedModuleName}, Expected: ${moduleName}`],
      });
    }

    // Create temporary directory for Move package
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aptos-compile-'));
    
    // Create Move.toml file
    // Map "Deployer" named address to the actual wallet address
    // Use testnet branch for dependencies (smaller, faster than mainnet)
    // Combine with --override-std testnet and --skip-fetch-latest-git-deps for faster compilation
    // We still need to define std and aptos_framework addresses (both are 0x1 on Aptos)
    const moveToml = `[package]
name = "${moduleName}"
version = "1.0.0"

[addresses]
Deployer = "${walletAddress}"
std = "0x1"
aptos_framework = "0x1"

[dependencies]
AptosFramework = { git = "https://github.com/aptos-labs/aptos-core.git", subdir = "aptos-move/framework/aptos-framework", rev = "testnet" }
AptosStdlib = { git = "https://github.com/aptos-labs/aptos-core.git", subdir = "aptos-move/framework/aptos-stdlib", rev = "testnet" }
`;

    await fs.writeFile(path.join(tempDir, 'Move.toml'), moveToml);

    // Create sources directory
    const sourcesDir = path.join(tempDir, 'sources');
    await fs.mkdir(sourcesDir, { recursive: true });

    // Write Move source file
    // Source code already uses "Deployer" as named address, no replacement needed
    const sourceFileName = `${moduleName}.move`;
    const sourceFilePath = path.join(sourcesDir, sourceFileName);
    
    await fs.writeFile(sourceFilePath, sourceCode);

    // Check if aptos CLI is available
    try {
      await execAsync('aptos --version');
    } catch (error) {
      return NextResponse.json({
        success: false,
        errors: [
          'Aptos CLI is not installed or not in PATH.',
          'Please install Aptos CLI: https://aptos.dev/tools/aptos-cli/install-cli/',
          'Or use: curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3'
        ],
      }, { status: 500 });
    }

    // Compile using Aptos CLI
    // Map "Deployer" named address to wallet address
    // Use --override-std testnet to ensure testnet compatibility
    // Use --skip-fetch-latest-git-deps to use cached dependencies (much faster after first run)
    // Use --save-metadata to generate package metadata for deployment
    const compileCommand = `aptos move compile --package-dir "${tempDir}" --named-addresses Deployer=${walletAddress} --override-std testnet --skip-fetch-latest-git-deps --save-metadata`;
    
    let compileOutput: string;
    try {
      console.log('Starting compilation with testnet framework (using cached dependencies if available)...');
      const { stdout, stderr } = await execAsync(compileCommand, {
        cwd: tempDir,
        timeout: 180000, // 180 seconds (3 minutes) - first run may need to download dependencies
        env: {
          ...process.env,
          GIT_HTTP_TIMEOUT: '180',
          GIT_TERMINAL_PROMPT: '0',
        },
      });
      compileOutput = stdout + stderr;
      console.log('Compilation completed successfully');
    } catch (error: any) {
      // Compilation failed - extract error messages
      const errorOutput = (error.stdout || '') + (error.stderr || '') + (error.message || '');
      
      // Log the full error output for debugging
      console.error('Aptos CLI compilation error:', errorOutput);
      console.error('Error code:', error.code);
      console.error('Error signal:', error.signal);
      
      // Check for specific error types
      let errors: string[] = [];
      
      // Check for git dependency errors or timeout
      const isTimeout = error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM';
      const isGitError = (errorOutput.includes('UPDATING GIT DEPENDENCY') && !errorOutput.includes('unbound module')) || 
                         (errorOutput.toLowerCase().includes('failed to fetch') && !errorOutput.includes('unbound module')) ||
                         (errorOutput.toLowerCase().includes('git clone') && !errorOutput.includes('unbound module')) ||
                         (errorOutput.toLowerCase().includes('git error') && !errorOutput.includes('unbound module'));
      
      // If there are unbound module errors, it's a compilation error, not a git error
      const hasUnboundModuleErrors = errorOutput.includes('unbound module') || errorOutput.includes('Unbound module');
      
      if ((isTimeout || isGitError) && !hasUnboundModuleErrors) {
        // Extract the actual error message from the output
        const errorLines = errorOutput.split('\n').filter((l: string) => 
          l.trim().length > 0 && 
          !l.includes('UPDATING GIT DEPENDENCY') &&
          !l.includes('Command failed:') &&
          !l.includes('Compiling, may take a little while') &&
          (l.toLowerCase().includes('error') || l.toLowerCase().includes('failed'))
        );
        
        if (isTimeout) {
          errors.push(
            'Compilation timed out.',
            '',
            'What happened:',
            '- The compilation exceeded the timeout limit',
            '- This is unusual when using the built-in testnet framework',
            '',
            'Solutions:',
            '1. Check your Move code for syntax errors',
            '2. Ensure the module name matches the file name',
            '3. Verify all imports are correct',
            '4. Try compiling again',
            '',
            errorLines.length > 0 
              ? 'Error details:\n' + errorLines.slice(0, 3).join('\n')
              : 'The compilation was interrupted.'
          );
        } else {
          errors.push(
            'Git dependency update failed during compilation.',
            '',
            'Possible causes:',
            '1. Network connectivity issues',
            '2. Git repository access problems',
            '3. Git not properly configured',
            '',
            'Solutions:',
            '- Check your internet connection',
            '- Try again in a moment (dependencies may be cached)',
            '- Ensure git is installed: git --version',
            '- First compilation downloads dependencies (takes 1-3 minutes)',
            '- Subsequent compilations use cached dependencies (much faster)',
            '',
            errorLines.length > 0 
              ? 'Error details:\n' + errorLines.slice(0, 5).join('\n')
              : 'Last output:\n' + errorOutput.split('\n').slice(-10).join('\n')
          );
        }
      } else {
        // This is a compilation error (not git-related)
        errors = extractCompilationErrors(errorOutput);
      }
      
      // If we couldn't extract meaningful errors, include more context
      if (errors.length === 0 || (errors.length === 1 && errors[0].includes('Compilation failed'))) {
        // Try to include the last few lines of output
        const outputLines = errorOutput.split('\n').filter((l: string) => l.trim().length > 0);
        const relevantLines = outputLines.slice(-10); // Last 10 non-empty lines
        if (relevantLines.length > 0) {
          errors.push(...relevantLines.map((l: string) => l.trim()).filter((l: string) => 
            !l.includes('Compiling') && 
            !l.includes('Building') &&
            l.length > 0
          ));
        }
      }
      
      return NextResponse.json({
        success: false,
        errors: errors.length > 0 ? errors : ['Compilation failed. Please check your Move code syntax.'],
        warnings: errorOutput.includes('warning') ? ['Compilation warnings occurred'] : undefined,
      });
    }

    // Read compiled bytecode
    const buildDir = path.join(tempDir, 'build', moduleName.replace(/([A-Z])/g, '_$1').toLowerCase(), 'bytecode_modules');
    const bytecodeFiles = await fs.readdir(buildDir);
    
    if (bytecodeFiles.length === 0) {
      return NextResponse.json({
        success: false,
        errors: ['No compiled bytecode files found'],
      });
    }

    // Read the first bytecode file (should match module name)
    const bytecodeFileName = bytecodeFiles.find(f => f.includes(moduleName)) || bytecodeFiles[0];
    const bytecodePath = path.join(buildDir, bytecodeFileName);
    const bytecode = await fs.readFile(bytecodePath);
    
    // Convert to hex string
    const bytecodeHex = '0x' + Buffer.from(bytecode).toString('hex');

    // Try to read package metadata if --save-metadata was used
    // Aptos CLI saves metadata in build/<package_name>/package-metadata.bcs
    let metadataBytes: string | undefined;
    try {
      const packageBuildDir = path.join(tempDir, 'build', moduleName.replace(/([A-Z])/g, '_$1').toLowerCase());
      
      // Try multiple possible metadata file locations
      const possibleMetadataPaths = [
        path.join(packageBuildDir, 'package-metadata.bcs'),
        path.join(packageBuildDir, 'metadata.bcs'),
        path.join(tempDir, 'build', 'package-metadata.bcs'),
        path.join(tempDir, 'build', 'metadata.bcs'),
      ];
      
      let metadataPath: string | null = null;
      for (const possiblePath of possibleMetadataPaths) {
        if (await fs.access(possiblePath).then(() => true).catch(() => false)) {
          metadataPath = possiblePath;
          break;
        }
      }
      
      if (metadataPath) {
        const metadata = await fs.readFile(metadataPath);
        metadataBytes = '0x' + Buffer.from(metadata).toString('hex');
        console.log('Found package metadata from compilation:', {
          path: metadataPath,
          hex: metadataBytes.substring(0, 50) + '...',
          length: metadataBytes.length,
        });
      } else {
        console.log('Package metadata not found in any expected location, will use empty metadata');
        // List files in build directory for debugging
        try {
          const buildFiles = await fs.readdir(packageBuildDir);
          console.log('Files in build directory:', buildFiles);
        } catch (e) {
          console.log('Could not list build directory:', e);
        }
      }
    } catch (metadataError) {
      console.warn('Could not read package metadata:', metadataError);
      // Continue without metadata - we'll generate it manually
    }

    // Extract ABI/function information
    const abi = {
      moduleName,
      accountAddress: walletAddress, // The actual address the module will be deployed to
      functions: extractFunctions(sourceCode),
    };

    const result: CompilationResult = {
      success: true,
      bytecode: bytecodeHex,
      metadataBytes, // Include metadata if available from CLI
      abi,
      warnings: compileOutput.includes('warning') ? ['Compilation completed with warnings'] : undefined,
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Compilation error:', error);

    const result: CompilationResult = {
      success: false,
      errors: [error.message || 'Unknown compilation error occurred'],
    };

    return NextResponse.json(result, { status: 500 });
  } finally {
    // Clean up temporary directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Failed to cleanup temp directory:', cleanupError);
      }
    }
  }
}

/**
 * Extract compilation errors from CLI output
 * Aptos CLI outputs errors in a structured format like:
 * error[E12345]: Error message
 *   --> sources/MyModule.move:12:5
 */
function extractCompilationErrors(output: string): string[] {
  const errors: string[] = [];
  const lines = output.split('\n');
  
  // Track if we're in an error block
  let inErrorBlock = false;
  let currentError: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detect error start: "error[E...]:" or "Error:"
    if (trimmed.match(/^error\[E\d+\]:/i) || trimmed.match(/^Error:/i)) {
      // Save previous error block if exists
      if (currentError.length > 0) {
        errors.push(currentError.join('\n'));
        currentError = [];
      }
      inErrorBlock = true;
      currentError.push(trimmed);
    }
    // Detect file location: "--> sources/..."
    else if (inErrorBlock && trimmed.startsWith('-->')) {
      currentError.push(trimmed);
    }
    // Detect error context lines (code snippets with ^ markers)
    else if (inErrorBlock && (trimmed.includes('^') || trimmed.match(/^\d+\s+\|/))) {
      currentError.push(trimmed);
    }
    // Detect error message continuation (indented lines)
    else if (inErrorBlock && trimmed.length > 0 && !trimmed.startsWith('Compiling') && !trimmed.startsWith('Building')) {
      // Check if this is part of the error or a new section
      if (trimmed.match(/^\w+\[/)) {
        // New error or warning, save current and start new
        if (currentError.length > 0) {
          errors.push(currentError.join('\n'));
        }
        currentError = [trimmed];
      } else if (currentError.length > 0) {
        // Continuation of current error
        currentError.push(trimmed);
      }
    }
    // Empty line ends error block
    else if (inErrorBlock && trimmed.length === 0) {
      if (currentError.length > 0) {
        errors.push(currentError.join('\n'));
        currentError = [];
      }
      inErrorBlock = false;
    }
    // Simple error patterns (fallback)
    else if (!inErrorBlock && (trimmed.toLowerCase().includes('error') || trimmed.match(/^error/i))) {
      if (!trimmed.includes('Compiling') && !trimmed.includes('Building') && !trimmed.includes('Building')) {
        errors.push(trimmed);
      }
    }
  }
  
  // Save last error block
  if (currentError.length > 0) {
    errors.push(currentError.join('\n'));
  }
  
  // If no structured errors found, try to extract any error-like messages
  if (errors.length === 0) {
    // Look for common error patterns
    const errorPatterns = [
      /error\[E\d+\]:\s*(.+)/gi,
      /Error:\s*(.+)/gi,
      /failed to compile/i,
      /compilation failed/i,
    ];
    
    for (const pattern of errorPatterns) {
      const matches = output.match(pattern);
      if (matches) {
        errors.push(...matches.map(m => m.trim()));
        break;
      }
    }
  }
  
  // If still no errors found but output contains "error", return the relevant section
  if (errors.length === 0 && output.toLowerCase().includes('error')) {
    // Extract lines around error keywords
    const errorLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      if (line.includes('error') && !line.includes('compiling') && !line.includes('building')) {
        // Include context (2 lines before and after)
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        errorLines.push(...lines.slice(start, end).map(l => l.trim()).filter(l => l.length > 0));
        break;
      }
    }
    if (errorLines.length > 0) {
      errors.push(errorLines.join('\n'));
    } else {
      errors.push('Move compilation failed. Please check your Move code syntax.');
    }
  }
  
  // If absolutely no errors found, return generic message
  if (errors.length === 0) {
    errors.push('Compilation failed. Please check your Move code syntax.');
  }
  
  return errors.slice(0, 10); // Limit to 10 errors
}

/**
 * Extract function signatures from Move source code
 */
function extractFunctions(sourceCode: string): string[] {
  const functions: string[] = [];
  const functionRegex = /(?:public\s+)?fun\s+(\w+)\s*\(/g;
  let match;

  while ((match = functionRegex.exec(sourceCode)) !== null) {
    functions.push(match[1]);
  }

  return functions;
}

/**
 * GET /api/compile
 * Returns API information
 */
export async function GET() {
  return NextResponse.json({
    message: 'Move Compilation API',
    version: '1.0.0',
    compilerVersion: 'Aptos CLI',
    endpoint: 'POST /api/compile',
    requiredFields: {
      sourceCode: 'string - Move source code',
      moduleName: 'string - Name of the module to compile',
    },
    note: 'Requires Aptos CLI to be installed on the server. Install from: https://aptos.dev/tools/aptos-cli/install-cli/',
    example: {
      sourceCode: 'module 0x123::MyModule { public fun hello() {} }',
      moduleName: 'MyModule',
    },
  });
}
