import type { ZodType } from 'zod';

interface ZodDef {
  typeName: string;
  [key: string]: unknown;
}

function defOf(schema: ZodType): ZodDef {
  return schema._def as unknown as ZodDef;
}

function innerOf(schema: ZodType): ZodType {
  return defOf(schema).innerType as ZodType;
}

function shapeOf(schema: ZodType): Record<string, ZodType> {
  const shape = defOf(schema).shape;
  return typeof shape === 'function' ? (shape as () => Record<string, ZodType>)() : {};
}

function isOptionalish(schema: ZodType): boolean {
  const typeName = defOf(schema).typeName;
  return typeName === 'ZodOptional' || typeName === 'ZodDefault';
}

export function toJsonSchema(schema: ZodType): Record<string, unknown> {
  const def = defOf(schema);
  switch (def.typeName) {
    case 'ZodObject': {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, sub] of Object.entries(shapeOf(schema))) {
        properties[key] = toJsonSchema(sub);
        if (!isOptionalish(sub)) required.push(key);
      }
      return { type: 'object', properties, required };
    }
    case 'ZodEffects':
      return toJsonSchema(def.schema as ZodType);
    case 'ZodOptional':
    case 'ZodDefault':
      return toJsonSchema(innerOf(schema));
    case 'ZodNullable': {
      const inner = toJsonSchema(innerOf(schema));
      const t = inner.type;
      return { ...inner, type: Array.isArray(t) ? [...t, 'null'] : [t, 'null'] };
    }
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum': {
      const values = def.values as readonly string[];
      return { type: 'string', enum: [...values] };
    }
    case 'ZodLiteral': {
      const value = def.value;
      const t = typeof value;
      if (t === 'string' || t === 'number' || t === 'boolean') {
        return { type: t, const: value };
      }
      throw new Error(`Unsupported ZodLiteral value: ${String(value)}`);
    }
    default:
      throw new Error(`Unsupported zod type: ${String(def.typeName)}`);
  }
}
