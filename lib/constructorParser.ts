export interface ConstructorParam {
  name: string;
  type: string;
  description?: string;
  placeholder?: string;
}

/**
 * Extract initialization parameters from Move module
 * Move modules use init_module functions instead of constructors
 */
export function extractConstructorParams(abi: any): ConstructorParam[] {
  try {
    // Move modules don't have constructors like Solidity
    // They use init_module functions
    // For now, return empty array as Move modules typically initialize themselves
    // In production, you'd parse the Move ABI to extract init_module parameters
    if (!abi || !abi.functions) {
      return [];
    }

    // Look for init_module function
    const initModule = abi.functions.find((f: string) => f.includes('init'));
    if (!initModule) {
      return [];
    }

    // For simplicity, return empty array
    // In production, parse Move function signatures
    return [];
  } catch (error) {
    console.error('Error extracting constructor params:', error);
    return [];
  }
}

/**
 * Get human-readable description for Move types
 */
function getTypeDescription(type: string): string {
  if (type === 'address') return 'Aptos address (0x...)';
  if (type === 'u64' || type === 'u128' || type === 'u256') return 'Number (unsigned integer)';
  if (type === 'u8' || type === 'u16' || type === 'u32') return 'Number';
  if (type === 'string') return 'Text string';
  if (type === 'bool') return 'Boolean (true/false)';
  if (type === 'vector') return 'Vector (array)';
  return type;
}

/**
 * Get placeholder value based on type and parameter name
 */
function getPlaceholder(type: string, name?: string): string {
  // Smart placeholders based on parameter name
  if (name) {
    const lowerName = name.toLowerCase();

    // Token-related
    if (lowerName.includes('name') && type === 'string') return 'MyToken';
    if (lowerName.includes('symbol') && type === 'string') return 'MTK';
    if (lowerName.includes('supply')) return '1000000';

    // Time-related
    if (lowerName.includes('timestamp') || lowerName.includes('time')) {
      return Math.floor(Date.now() / 1000).toString();
    }
    if (lowerName.includes('duration') && lowerName.includes('day')) return '30';
    if (lowerName.includes('duration') && lowerName.includes('hour')) return '24';

    // Address-related
    if (lowerName.includes('owner') || lowerName.includes('admin')) {
      return '0x0';
    }
    if (lowerName.includes('token') && type === 'address') {
      return '0x0';
    }

    // Numerical
    if (lowerName.includes('amount') || lowerName.includes('value')) {
      return '100';
    }
    if (lowerName.includes('percentage') || lowerName.includes('rate')) {
      return '10';
    }
  }

  // Default placeholders by type
  if (type === 'address') return '0x0';
  if (type === 'u64' || type === 'u128' || type === 'u256' || type.startsWith('u')) return '0';
  if (type === 'string') return 'Enter text';
  if (type === 'bool') return 'true';
  if (type === 'vector') return '[]';

  return '';
}

/**
 * Get default value for a parameter type
 */
export function getDefaultValue(type: string, name?: string): string {
  if (name) {
    const lowerName = name.toLowerCase();

    // Token defaults
    if (lowerName.includes('name') && type === 'string') return 'MyToken';
    if (lowerName.includes('symbol') && type === 'string') return 'MTK';
    if (lowerName.includes('supply')) return '1000000';

    // Time defaults
    if (lowerName.includes('timestamp') || lowerName.includes('startat')) {
      return Math.floor(Date.now() / 1000).toString();
    }
    if (lowerName.includes('endat') || lowerName.includes('deadline')) {
      return (Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60).toString(); // 30 days
    }

    // APT amounts (in smallest unit: octas)
    if (lowerName.includes('price') && (type === 'u64' || type === 'u128')) {
      return '10000000'; // 0.1 APT (in octas)
    }
    if (lowerName.includes('goal') && (type === 'u64' || type === 'u128')) {
      return '10000000000'; // 100 APT (in octas)
    }
  }

  // Type-based defaults
  if (type === 'address') return '0x0';
  if (type === 'u64' || type === 'u128' || type === 'u256' || type.startsWith('u')) return '0';
  if (type === 'string') return '';
  if (type === 'bool') return 'false';
  if (type === 'vector') return '[]';

  return '';
}

/**
 * Validate constructor argument based on type
 */
export function validateConstructorArg(value: string, type: string): { valid: boolean; error?: string } {
  try {
    if (!value && type !== 'string') {
      return { valid: false, error: 'Value is required' };
    }

    if (type === 'address') {
      // Basic Aptos address validation (starts with 0x and is hex)
      if (!value.startsWith('0x') || value.length < 3) {
        return { valid: false, error: 'Invalid Aptos address' };
      }
      // Check if it's valid hex
      if (!/^0x[0-9a-fA-F]+$/.test(value)) {
        return { valid: false, error: 'Invalid hex address format' };
      }
    } else if (type.startsWith('u') || type.startsWith('u64') || type.startsWith('u128') || type.startsWith('u256')) {
      if (!/^\d+$/.test(value)) {
        return { valid: false, error: 'Must be a number' };
      }
      // Check if it's a valid BigInt
      BigInt(value);
    } else if (type === 'bool') {
      if (value !== 'true' && value !== 'false') {
        return { valid: false, error: 'Must be true or false' };
      }
    } else if (type === 'vector') {
      try {
        JSON.parse(value);
      } catch {
        return { valid: false, error: 'Must be valid JSON array' };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid value format' };
  }
}

/**
 * Convert string values to proper types for contract deployment
 */
export function formatConstructorArgs(params: ConstructorParam[], values: string[]): any[] {
  return params.map((param, index) => {
    const value = values[index] || '';

    try {
      // Handle vectors (arrays)
      if (param.type === 'vector') {
        const parsed = JSON.parse(value || '[]');
        return parsed;
      }

      // Handle booleans
      if (param.type === 'bool') {
        return value === 'true';
      }

      // Handle addresses - return as-is
      if (param.type === 'address') {
        return value;
      }

      // Handle numbers - return as string for BigInt compatibility
      if (param.type.startsWith('u') || param.type === 'u64' || param.type === 'u128' || param.type === 'u256') {
        return value || '0';
      }

      // Handle strings
      if (param.type === 'string') {
        return value;
      }

      return value;
    } catch (error) {
      console.error(`Error formatting arg ${param.name}:`, error);
      return value;
    }
  });
}
