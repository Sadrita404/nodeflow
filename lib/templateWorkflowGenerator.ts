import { Node, Edge } from '@xyflow/react';
import { nodeConfigs } from '@/types/nodes';
import { ContractTemplate } from './contractTemplates';

/**
 * Generate a complete workflow from a contract template
 * Creates all necessary nodes and connects them
 */
export function generateWorkflowFromTemplate(
  template: ContractTemplate
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const baseY = 100;
  const spacing = 120;
  let currentY = baseY;

  // 1. Project Create Node
  const projectNode: Node = {
    id: `project-${Date.now()}`,
    type: 'custom',
    position: { x: 400, y: currentY },
    data: {
      label: nodeConfigs.projectCreate.label,
      type: 'projectCreate',
      icon: nodeConfigs.projectCreate.icon,
      status: 'idle',
      projectTitle: `${template.name} Project`,
      projectDescription: template.description,
    },
  };
  nodes.push(projectNode);
  currentY += spacing;

  // 2. Contract Input Node (with template code)
  const contractNode: Node = {
    id: `contract-${Date.now()}`,
    type: 'custom',
    position: { x: 400, y: currentY },
    data: {
      label: nodeConfigs.contractInput.label,
      type: 'contractInput',
      icon: nodeConfigs.contractInput.icon,
      status: 'idle',
      contractCode: template.code,
      contractName: extractContractName(template.code),
    },
  };
  nodes.push(contractNode);
  edges.push({
    id: `${projectNode.id}-${contractNode.id}`,
    source: projectNode.id,
    target: contractNode.id,
    animated: true,
  });
  currentY += spacing;

  // 3. Compile Node
  const compileNode: Node = {
    id: `compile-${Date.now()}`,
    type: 'custom',
    position: { x: 400, y: currentY },
    data: {
      label: nodeConfigs.compile.label,
      type: 'compile',
      icon: nodeConfigs.compile.icon,
      status: 'idle',
      compilerVersion: 'Move 1.0',
    },
  };
  nodes.push(compileNode);
  edges.push({
    id: `${contractNode.id}-${compileNode.id}`,
    source: contractNode.id,
    target: compileNode.id,
    animated: true,
  });
  currentY += spacing;

  // 4. Generate ABI Node (left side)
  const abiNode: Node = {
    id: `abi-${Date.now()}`,
    type: 'custom',
    position: { x: 250, y: currentY },
    data: {
      label: nodeConfigs.generateABI.label,
      type: 'generateABI',
      icon: nodeConfigs.generateABI.icon,
      status: 'idle',
    },
  };
  nodes.push(abiNode);
  edges.push({
    id: `${compileNode.id}-${abiNode.id}`,
    source: compileNode.id,
    target: abiNode.id,
    animated: true,
  });

  // 5. Generate Bytecode Node (right side)
  const bytecodeNode: Node = {
    id: `bytecode-${Date.now()}`,
    type: 'custom',
    position: { x: 550, y: currentY },
    data: {
      label: nodeConfigs.generateBytecode.label,
      type: 'generateBytecode',
      icon: nodeConfigs.generateBytecode.icon,
      status: 'idle',
    },
  };
  nodes.push(bytecodeNode);
  edges.push({
    id: `${compileNode.id}-${bytecodeNode.id}`,
    source: compileNode.id,
    target: bytecodeNode.id,
    animated: true,
  });
  currentY += spacing;

  // 6. Deploy Node (center, below ABI and Bytecode)
  // Generate default constructor arguments based on the template
  const defaultConstructorArgs = getDefaultConstructorArgs(template);

  const deployNode: Node = {
    id: `deploy-${Date.now()}`,
    type: 'custom',
    position: { x: 400, y: currentY },
    data: {
      label: nodeConfigs.deploy.label,
      type: 'deploy',
      icon: nodeConfigs.deploy.icon,
      status: 'idle',
      constructorArgs: defaultConstructorArgs,
      // Also store string representations for the dynamic form
      constructorArgsValues: defaultConstructorArgs.map(arg =>
        typeof arg === 'string' ? arg : String(arg)
      ),
    },
  };
  nodes.push(deployNode);
  edges.push({
    id: `${abiNode.id}-${deployNode.id}`,
    source: abiNode.id,
    target: deployNode.id,
    animated: true,
  });
  edges.push({
    id: `${bytecodeNode.id}-${deployNode.id}`,
    source: bytecodeNode.id,
    target: deployNode.id,
    animated: true,
  });
  currentY += spacing;

  // 7. Completion Node
  const completionNode: Node = {
    id: `completion-${Date.now()}`,
    type: 'custom',
    position: { x: 400, y: currentY },
    data: {
      label: nodeConfigs.completion.label,
      type: 'completion',
      icon: nodeConfigs.completion.icon,
      status: 'idle',
    },
  };
  nodes.push(completionNode);
  edges.push({
    id: `${deployNode.id}-${completionNode.id}`,
    source: deployNode.id,
    target: completionNode.id,
    animated: true,
  });

  return { nodes, edges };
}

/**
 * Generate a workflow with AI audit node
 */
export function generateWorkflowWithAI(
  template: ContractTemplate
): { nodes: Node[]; edges: Edge[] } {
  const { nodes, edges } = generateWorkflowFromTemplate(template);

  // Find the contract input node
  const contractNode = nodes.find((n) => n.data.type === 'contractInput');
  const compileNode = nodes.find((n) => n.data.type === 'compile');

  if (contractNode && compileNode) {
    // Insert AI Audit node between contract and compile
    const aiNode: Node = {
      id: `ai-${Date.now()}`,
      type: 'custom',
      position: {
        x: contractNode.position.x + 200,
        y: contractNode.position.y + 60,
      },
      data: {
        label: nodeConfigs.aiAudit.label,
        type: 'aiAudit',
        icon: nodeConfigs.aiAudit.icon,
        status: 'idle',
        aiPrompt: 'Analyze this smart contract for security vulnerabilities and suggest improvements.',
      },
    };

    nodes.push(aiNode);

    // Add edge from contract to AI
    edges.push({
      id: `${contractNode.id}-${aiNode.id}`,
      source: contractNode.id,
      target: aiNode.id,
      animated: true,
    });
  }

  return { nodes, edges };
}

/**
 * Extract module name from Move code
 */
function extractContractName(sourceCode: string): string {
  // Move module format: module Deployer::<module_name>
  const match = sourceCode.match(/module\s+\w+::(\w+)/);
  return match ? match[1] : 'MyModule';
}

/**
 * Get default constructor arguments based on template ID
 * Note: Move modules use init_module functions, not constructors
 * These are placeholder values for any init_module parameters if needed
 */
function getDefaultConstructorArgs(template: ContractTemplate): any[] {
  switch (template.id) {
    case 'simple-token':
      // Move managed coin init_module doesn't take constructor args
      // The coin is initialized in init_module function
      return [];

    case 'simple-nft':
      // NFT collection creation doesn't require constructor args
      return [];

    case 'crowdfunding':
      // create_campaign function parameters: title, description, goal, duration_seconds
      // Note: goal is in octas (smallest unit), 1 APT = 100000000 octas
      const goalOctas = (10 * 100000000).toString(); // 10 APT in octas
      const durationSeconds = (30 * 24 * 60 * 60).toString(); // 30 days
      return [
        'My Campaign',
        'Description of my campaign',
        goalOctas,
        durationSeconds
      ];

    case 'multisig-wallet':
      // initialize function: owners vector, required confirmations
      // Note: owners would be passed as a vector of addresses
      return [
        [], // Empty owners array - user should add addresses
        '2' // Number of required confirmations
      ];

    case 'voting':
      // initialize function doesn't take parameters
      return [];

    case 'staking':
      // initialize function doesn't take parameters
      return [];

    default:
      return []; // Empty array for Move modules (most use init_module without params)
  }
}

/**
 * Convert APT amount to octas (smallest unit)
 * 1 APT = 100,000,000 octas
 */
function aptToOctas(apt: number): string {
  return (apt * 100000000).toString();
}
