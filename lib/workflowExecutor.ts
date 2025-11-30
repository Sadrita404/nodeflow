import { Node, Edge } from '@xyflow/react';
import { NodeData, NodeType } from '@/types/nodes';
import { compileContract, extractContractName, validateMoveCode } from './contractCompiler';
import { connectWallet, deployContract } from './blockchainService';
import { analyzeContract } from './openaiService';
import { Network } from '@/store/workflowStore';

export interface ExecutionContext {
  nodes: Node[];
  edges: Edge[];
  selectedNetwork: Network | null;
  onNodeUpdate: (nodeId: string, data: Partial<NodeData>) => void;
  onNodeStatus: (nodeId: string, status: 'idle' | 'running' | 'success' | 'error') => void;
  onEdgeUpdate?: (edges: Edge[]) => void;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: any;
}

export class WorkflowExecutor {
  private context: ExecutionContext;
  private executionData: Map<string, any> = new Map();
  private stopped: boolean = false;

  constructor(context: ExecutionContext) {
    this.context = context;
  }

  public stop() {
    this.stopped = true;
  }

  public async execute(): Promise<ExecutionResult> {
    this.stopped = false;
    this.executionData.clear();

    try {
      // Build execution order from edges
      const executionOrder = this.buildExecutionOrder();

      if (executionOrder.length === 0) {
        return {
          success: false,
          message: 'No nodes to execute. Please add nodes to your workflow.',
        };
      }

      // Execute nodes in order
      for (const nodeId of executionOrder) {
        if (this.stopped) {
          return {
            success: false,
            message: 'Workflow execution stopped by user',
          };
        }

        const node = this.context.nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        const result = await this.executeNode(node);

        if (!result.success) {
          return {
            success: false,
            message: `Failed at node "${node.data.label}": ${result.message}`,
          };
        }

        // Store execution data
        this.executionData.set(nodeId, result.data);
      }

      // Generate completion summary
      const summary = this.generateSummary();

      return {
        success: true,
        message: 'Workflow executed successfully',
        data: { summary, executionData: Object.fromEntries(this.executionData) },
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Unknown error during workflow execution',
      };
    }
  }

  private buildExecutionOrder(): string[] {
    const { nodes, edges } = this.context;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // Initialize
    nodes.forEach((node) => {
      inDegree.set(node.id, 0);
      adjacencyList.set(node.id, []);
    });

    // Build graph
    edges.forEach((edge) => {
      adjacencyList.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    });

    // Topological sort (Kahn's algorithm)
    const queue: string[] = [];
    const result: string[] = [];

    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      adjacencyList.get(nodeId)?.forEach((neighbor) => {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    // If result doesn't include all nodes, there's a cycle
    if (result.length !== nodes.length) {
      throw new Error('Workflow contains a cycle. Please check your connections.');
    }

    return result;
  }

  private updateEdgeStatus(nodeId: string, status: 'idle' | 'running' | 'success' | 'error') {
    if (!this.context.onEdgeUpdate) return;

    const updatedEdges = this.context.edges.map(edge => {
      // Update edges connected to this node
      if (edge.source === nodeId) {
        return {
          ...edge,
          data: { ...edge.data, sourceStatus: status }
        };
      }
      if (edge.target === nodeId) {
        return {
          ...edge,
          data: { ...edge.data, targetStatus: status }
        };
      }
      return edge;
    });

    this.context.onEdgeUpdate(updatedEdges);
  }

  private async executeNode(node: Node): Promise<ExecutionResult> {
    const nodeData = node.data as NodeData;
    const nodeType = nodeData.type;

    // Update status to running
    this.context.onNodeStatus(node.id, 'running');
    this.updateEdgeStatus(node.id, 'running');

    try {
      let result: ExecutionResult;

      switch (nodeType) {
        case 'projectCreate':
          result = await this.executeProjectCreate(node);
          break;
        case 'contractInput':
          result = await this.executeContractInput(node);
          break;
        case 'compile':
          result = await this.executeCompile(node);
          break;
        case 'generateABI':
          result = await this.executeGenerateABI(node);
          break;
        case 'generateBytecode':
          result = await this.executeGenerateBytecode(node);
          break;
        case 'deploy':
          result = await this.executeDeploy(node);
          break;
        case 'aiAudit':
          result = await this.executeAIAudit(node);
          break;
        case 'completion':
          result = await this.executeCompletion(node);
          break;
        default:
          result = {
            success: false,
            message: `Unknown node type: ${nodeType}`,
          };
      }

      if (result.success) {
        this.context.onNodeStatus(node.id, 'success');
        this.updateEdgeStatus(node.id, 'success');
        this.context.onNodeUpdate(node.id, { output: result.data });
      } else {
        this.context.onNodeStatus(node.id, 'error');
        this.updateEdgeStatus(node.id, 'error');
        this.context.onNodeUpdate(node.id, { error: result.message });
      }

      // Small delay for visual feedback
      await new Promise((resolve) => setTimeout(resolve, 500));

      return result;
    } catch (error: any) {
      this.context.onNodeStatus(node.id, 'error');
      this.updateEdgeStatus(node.id, 'error');
      this.context.onNodeUpdate(node.id, { error: error.message });

      return {
        success: false,
        message: error.message || 'Node execution failed',
      };
    }
  }

  private async executeProjectCreate(node: Node): Promise<ExecutionResult> {
    const nodeData = node.data as NodeData;

    if (!nodeData.projectTitle) {
      return {
        success: false,
        message: 'Project title is required',
      };
    }

    return {
      success: true,
      message: 'Project initialized',
      data: {
        title: nodeData.projectTitle,
        description: nodeData.projectDescription || '',
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async executeContractInput(node: Node): Promise<ExecutionResult> {
    const nodeData = node.data as NodeData;

    if (!nodeData.contractCode) {
      return {
        success: false,
        message: 'Contract code is required',
      };
    }

    const validation = validateMoveCode(nodeData.contractCode);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.message || 'Invalid Move code',
      };
    }

    // Extract contract name if not provided
    let contractName = nodeData.contractName;
    if (!contractName) {
      const extracted = extractContractName(nodeData.contractCode);
      if (!extracted) {
        return {
          success: false,
          message: 'Could not extract contract name. Please specify it manually.',
        };
      }
      contractName = extracted;
      this.context.onNodeUpdate(node.id, { contractName });
    }

    return {
      success: true,
      message: 'Contract code validated',
      data: {
        contractCode: nodeData.contractCode,
        contractName,
      },
    };
  }

  private async executeCompile(node: Node): Promise<ExecutionResult> {
    const nodeData = node.data as NodeData;

    // Get contract code from previous node
    const contractData = this.findPreviousData('contractInput');
    if (!contractData?.contractCode) {
      return {
        success: false,
        message: 'No contract code found. Please add a Contract Input node before compilation.',
      };
    }

    // Get wallet address - required for compilation
    // Move modules use "Deployer" named address which gets mapped to wallet address
    let walletAddress: string | undefined;
    
    // Method 1: Try to get from window.aptos directly (most reliable)
    if (typeof window !== 'undefined' && window.aptos) {
      try {
        const account = await window.aptos.account();
        if (account && account.address) {
          walletAddress = account.address;
          // Save to localStorage for future use
          localStorage.setItem('walletAddress', account.address);
        }
      } catch (error) {
        console.warn('Could not get account from window.aptos:', error);
      }
    }
    
    // Method 2: Fallback to localStorage if direct access failed
    if (!walletAddress && typeof window !== 'undefined') {
      const savedAddress = localStorage.getItem('walletAddress');
      if (savedAddress && /^0x[a-fA-F0-9]{1,64}$/.test(savedAddress)) {
        // Try to verify it's still valid
        if (window.aptos) {
          try {
            const account = await window.aptos.account();
            if (account && account.address === savedAddress) {
              walletAddress = savedAddress;
            }
          } catch {
            // If verification fails, use saved address anyway
            // The compilation API will handle validation
            walletAddress = savedAddress;
          }
        } else {
          // No wallet available, but use saved address for compilation attempt
          walletAddress = savedAddress;
        }
      }
    }

    if (!walletAddress) {
      return {
        success: false,
        message: 'Wallet not connected. Please connect your wallet before compiling. Click "Connect Wallet" in the top bar.',
      };
    }

    const result = await compileContract(
      contractData.contractCode,
      contractData.contractName || 'MyModule',
      walletAddress
    );

    if (!result.success) {
      // Format errors for better display
      let errorMessage = 'Compilation failed';
      if (result.errors && result.errors.length > 0) {
        // Join errors with newlines, but limit length for UI display
        const formattedErrors = result.errors.map((err, idx) => {
          // Truncate very long errors
          if (err.length > 500) {
            return `${err.substring(0, 500)}... (truncated)`;
          }
          return err;
        });
        errorMessage = formattedErrors.join('\n\n');
      }
      
      return {
        success: false,
        message: errorMessage,
      };
    }

    // Debug logging
    console.log('Compile - result:', result);
    console.log('Compile - result.bytecode:', result.bytecode);
    console.log('Compile - result.bytecode type:', typeof result.bytecode);
    console.log('Compile - result.bytecode length:', typeof result.bytecode === 'string' ? result.bytecode.length : 'N/A');

    this.context.onNodeUpdate(node.id, {
      compilationResult: result,
    });

    // Store the full result in executionData so it can be retrieved later
    // The result object contains: { success, bytecode, abi, errors?, warnings? }
    return {
      success: true,
      message: 'Contract compiled successfully',
      data: result, // This gets stored in executionData
    };
  }

  private async executeGenerateABI(node: Node): Promise<ExecutionResult> {
    const compilationResult = this.findPreviousData('compile');

    if (!compilationResult?.abi) {
      return {
        success: false,
        message: 'No compilation result found. Please compile the contract first.',
      };
    }

    this.context.onNodeUpdate(node.id, {
      abi: compilationResult.abi,
    });

    return {
      success: true,
      message: 'ABI generated successfully',
      data: { abi: compilationResult.abi },
    };
  }

  private async executeGenerateBytecode(node: Node): Promise<ExecutionResult> {
    const compilationResult = this.findPreviousData('compile');

    // Debug logging
    console.log('GenerateBytecode - compilationResult:', compilationResult);
    console.log('GenerateBytecode - compilationResult.bytecode:', compilationResult?.bytecode);
    console.log('GenerateBytecode - bytecode type:', typeof compilationResult?.bytecode);
    console.log('GenerateBytecode - bytecode length:', typeof compilationResult?.bytecode === 'string' ? compilationResult.bytecode.length : 'N/A');

    if (!compilationResult) {
      return {
        success: false,
        message: 'No compilation result found. Please compile the contract first.',
      };
    }

    // Try different possible bytecode locations
    const bytecode = compilationResult.bytecode || compilationResult.data?.bytecode || compilationResult.compilationResult?.bytecode;
    
    if (!bytecode) {
      console.error('GenerateBytecode - No bytecode found in compilation result. Keys:', Object.keys(compilationResult));
      return {
        success: false,
        message: 'No bytecode found in compilation result. Please ensure compilation completed successfully.',
      };
    }

    // Validate bytecode
    if (typeof bytecode === 'string' && (bytecode === '' || bytecode === '0x')) {
      return {
        success: false,
        message: 'Bytecode is empty. Please ensure compilation completed successfully.',
      };
    }

    this.context.onNodeUpdate(node.id, {
      bytecode: bytecode,
    });

    return {
      success: true,
      message: 'Bytecode generated successfully',
      data: { bytecode: bytecode },
    };
  }

  private async executeDeploy(node: Node): Promise<ExecutionResult> {
    const nodeData = node.data as NodeData;

    // Get bytecode and module name
    let bytecodeData = this.findPreviousData('generateBytecode');
    const contractData = this.findPreviousData('contractInput');
    const compilationResult = this.findPreviousData('compile');

    // Debug logging - log everything to understand the data structure
    console.log('Deploy - bytecodeData (full object):', JSON.stringify(bytecodeData, null, 2));
    console.log('Deploy - contractData:', contractData);
    console.log('Deploy - compilationResult:', compilationResult);
    console.log('Deploy - bytecodeData?.bytecode:', bytecodeData?.bytecode);
    console.log('Deploy - bytecodeData?.data?.bytecode:', bytecodeData?.data?.bytecode);

    // Try multiple ways to get bytecode
    let bytecode: string | undefined = bytecodeData?.bytecode || bytecodeData?.data?.bytecode;
    
    if (!bytecode) {
      // Try to get bytecode from compilation result directly
      console.log('Deploy - compilationResult (full object):', JSON.stringify(compilationResult, null, 2));
      console.log('Deploy - compilationResult?.bytecode:', compilationResult?.bytecode);
      console.log('Deploy - compilationResult?.data?.bytecode:', compilationResult?.data?.bytecode);
      
      bytecode = compilationResult?.bytecode || compilationResult?.data?.bytecode;
      
      if (!bytecode) {
        console.error('Deploy - CRITICAL: No bytecode found anywhere!');
        console.error('Deploy - bytecodeData keys:', bytecodeData ? Object.keys(bytecodeData) : 'bytecodeData is null/undefined');
        console.error('Deploy - compilationResult keys:', compilationResult ? Object.keys(compilationResult) : 'compilationResult is null/undefined');
        return {
          success: false,
          message: 'Bytecode is required. Please compile the contract and generate bytecode first. Check console for details.',
        };
      }
      // Create bytecodeData object with the found bytecode
      bytecodeData = { bytecode: bytecode };
    }

    // Get metadataBytes from compilation result if available
    const metadataBytes = compilationResult?.metadataBytes || compilationResult?.data?.metadataBytes;
    if (metadataBytes) {
      console.log('Deploy - Found metadataBytes from compilation:', metadataBytes.substring(0, 50) + '...');
    } else {
      console.log('Deploy - No metadataBytes found, will use empty metadata');
    }

    if (!contractData?.contractName) {
      return {
        success: false,
        message: 'Module name is required for deployment.',
      };
    }

    // Check network selection
    if (!this.context.selectedNetwork) {
      return {
        success: false,
        message: 'No network selected. Please select a network from the top bar.',
      };
    }

    // Connect wallet
    const wallet = await connectWallet();
    if (!wallet) {
      return {
        success: false,
        message: 'Failed to connect wallet. Please connect Petra wallet.',
      };
    }

    // Get constructor args - ensure it's an array
    let constructorArgs = nodeData.constructorArgs || [];

    // If constructorArgs is not an array, try to parse it
    if (!Array.isArray(constructorArgs)) {
      try {
        constructorArgs = JSON.parse(constructorArgs);
      } catch {
        constructorArgs = [];
      }
    }

    // Validate bytecode before deployment - use the bytecode we already extracted
    // Additional validation
    if (!bytecode) {
      console.error('Deploy - CRITICAL: bytecode is still undefined after extraction!');
      console.error('Deploy - bytecodeData:', bytecodeData);
      return {
        success: false,
        message: 'Bytecode is missing. Please ensure compilation and bytecode generation completed successfully.',
      };
    }

    // Strict validation - bytecode must be a non-empty string
    if (typeof bytecode !== 'string') {
      console.error('Deploy - CRITICAL: bytecode is not a string!', typeof bytecode, bytecode);
      return {
        success: false,
        message: `Invalid bytecode type: ${typeof bytecode}. Expected string.`,
      };
    }

    if (bytecode === '' || bytecode === '0x' || bytecode.length <= 2) {
      console.error('Deploy - CRITICAL: bytecode is empty or invalid!', {
        bytecode,
        length: bytecode.length,
        startsWith0x: bytecode.startsWith('0x'),
      });
      return {
        success: false,
        message: `Bytecode is empty or invalid (length: ${bytecode.length}). Please ensure compilation completed successfully and generated valid bytecode.`,
      };
    }

    // Log for debugging
    console.log('Deploy - Constructor args:', constructorArgs);
    console.log('Deploy - Module name:', contractData.contractName);
    console.log('Deploy - Bytecode type:', typeof bytecode);
    console.log('Deploy - Bytecode length:', typeof bytecode === 'string' ? bytecode.length : (bytecode as any)?.length || 'N/A');
    console.log('Deploy - Bytecode preview:', typeof bytecode === 'string' ? bytecode.substring(0, 100) : 'Not a string');

    // Deploy contract (Move module)
    // Pass metadataBytes from compilation if available
    const deployResult = await deployContract(
      bytecode,
      contractData.contractName,
      constructorArgs,
      wallet.account,
      metadataBytes // Pass metadataBytes from compilation if available
    );

    if (!deployResult.success) {
      return {
        success: false,
        message: deployResult.error || 'Deployment failed',
      };
    }

    this.context.onNodeUpdate(node.id, {
      deployedAddress: deployResult.contractAddress,
      transactionHash: deployResult.transactionHash,
    });

    return {
      success: true,
      message: 'Contract deployed successfully',
      data: deployResult,
    };
  }

  private async executeAIAudit(node: Node): Promise<ExecutionResult> {
    const nodeData = node.data as NodeData;

    // Get contract code
    const contractData = this.findPreviousData('contractInput');
    if (!contractData?.contractCode) {
      return {
        success: false,
        message: 'No contract code found for analysis.',
      };
    }

    const prompt = nodeData.aiPrompt || 'Analyze this smart contract for security vulnerabilities and suggest improvements.';

    const result = await analyzeContract(contractData.contractCode, prompt);

    if (!result.success) {
      return {
        success: false,
        message: result.error || 'AI analysis failed',
      };
    }

    this.context.onNodeUpdate(node.id, {
      aiResponse: result.response,
    });

    return {
      success: true,
      message: 'AI analysis completed',
      data: { response: result.response },
    };
  }

  private async executeCompletion(node: Node): Promise<ExecutionResult> {
    const summary = this.generateSummary();

    this.context.onNodeUpdate(node.id, {
      summary,
    });

    return {
      success: true,
      message: 'Workflow completed',
      data: { summary },
    };
  }

  private findPreviousData(nodeType: NodeType): any {
    for (const [nodeId, data] of this.executionData.entries()) {
      const node = this.context.nodes.find((n) => n.id === nodeId);
      if (node && (node.data as NodeData).type === nodeType) {
        return data;
      }
    }
    return null;
  }

  private generateSummary(): string {
    const lines: string[] = ['Workflow Execution Summary', '=' .repeat(40), ''];

    const projectData = this.findPreviousData('projectCreate');
    if (projectData) {
      lines.push(`Project: ${projectData.title}`);
      if (projectData.description) {
        lines.push(`Description: ${projectData.description}`);
      }
      lines.push('');
    }

    const contractData = this.findPreviousData('contractInput');
    if (contractData) {
      lines.push(`Contract Name: ${contractData.contractName}`);
    }

    const compileData = this.findPreviousData('compile');
    if (compileData) {
      lines.push('✓ Compilation: Success');
    }

    const deployData = this.findPreviousData('deploy');
    if (deployData) {
      lines.push(`✓ Deployment: Success`);
      // Keep full addresses - they will be wrapped properly in the UI
      if (deployData.contractAddress) {
        lines.push(`  Contract Address: ${deployData.contractAddress}`);
      }
      if (deployData.transactionHash) {
        lines.push(`  Transaction Hash: ${deployData.transactionHash}`);
      }
      if (this.context.selectedNetwork) {
        lines.push(`  Network: ${this.context.selectedNetwork.name}`);
      }
    }

    const aiData = this.findPreviousData('aiAudit');
    if (aiData) {
      lines.push('✓ AI Analysis: Completed');
    }

    lines.push('');
    lines.push(`Execution completed at: ${new Date().toLocaleString()}`);

    return lines.join('\n');
  }
}
