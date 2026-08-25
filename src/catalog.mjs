import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export function normalizeCatalogRecord(record) {
  const required = ['id', 'name', 'body_part', 'equipment', 'target'];
  if (!record || required.some((field) => typeof record[field] !== 'string' || !record[field].trim())) {
    throw new Error('Catalog records require an id, name, body part, equipment, and target.');
  }
  const steps = Array.isArray(record.instruction_steps?.en)
    ? record.instruction_steps.en.filter((step) => typeof step === 'string' && step.trim()).map((step) => step.trim())
    : [];
  const instructions = steps.length ? steps : String(record.instructions?.en ?? '').split(/\n+/).map((step) => step.trim()).filter(Boolean);
  return {
    id: record.id.trim(),
    name: record.name.trim(),
    bodyPart: record.body_part.trim(),
    equipment: record.equipment.trim(),
    target: record.target.trim(),
    muscleGroup: String(record.muscle_group ?? '').trim(),
    secondaryMuscles: Array.isArray(record.secondary_muscles) ? record.secondary_muscles.filter((item) => typeof item === 'string') : [],
    instructions,
    imagePath: safeRelativeMediaPath(record.image, ['.jpg', '.jpeg', '.png']),
    gifPath: safeRelativeMediaPath(record.gif_url, ['.gif']),
    attribution: String(record.attribution ?? '').trim(),
    source: 'hasaneyldrm/exercises-dataset'
  };
}

function customText(value, name, maximum = 80) {
  const text = String(value ?? '').trim();
  if (!text || text.length > maximum) {
    throw Object.assign(new Error(`${name} must be between 1 and ${maximum} characters.`), { statusCode: 400 });
  }
  return text;
}

export function normalizeCustomExercise(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Custom exercise details are required.'), { statusCode: 400 });
  }
  const instructions = Array.isArray(input.instructions)
    ? input.instructions
    : String(input.instructions ?? '').split(/\n+/);
  const cleanedInstructions = instructions.map((step) => String(step).trim()).filter(Boolean);
  if (cleanedInstructions.length > 12 || cleanedInstructions.some((step) => step.length > 500)) {
    throw Object.assign(new Error('Use at most 12 instruction steps of up to 500 characters each.'), { statusCode: 400 });
  }
  return {
    name: customText(input.name, 'Exercise name'),
    bodyPart: customText(input.bodyPart, 'Body part', 60),
    equipment: customText(input.equipment, 'Equipment', 60),
    target: customText(input.target, 'Target muscle', 60),
    instructions: cleanedInstructions
  };
}

function safeRelativeMediaPath(value, extensions) {
  const path = String(value ?? '').replaceAll('\\', '/');
  if (!path || path.startsWith('/') || path.split('/').includes('..') || !extensions.some((extension) => path.toLowerCase().endsWith(extension))) return null;
  return path;
}

export function loadCatalogFile(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed) || parsed.length > 10_000) throw new Error('Catalog must be an array of at most 10,000 exercises.');
  return parsed.map(normalizeCatalogRecord);
}

export function licensedMediaFile(mediaDirectory, relativePath) {
  if (!mediaDirectory || !relativePath) return null;
  const root = resolve(mediaDirectory);
  const file = resolve(root, relativePath);
  if (file !== root && !file.startsWith(`${root}${sep}`)) return null;
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return file;
}
