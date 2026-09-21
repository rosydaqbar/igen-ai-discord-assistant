import { bodyFieldCriteria, operationCriteria } from '../discord/apiCatalog.js';
import { choiceQuestion, noulQuestion } from './client.js';

const CONVERSATION = '__conversation__';
const AMBIGUOUS = '__ambiguous__';

export class JevApiRouter {
  constructor({ client, catalog, confidenceThreshold = 0.85 }) {
    this.client = client;
    this.catalog = catalog;
    this.confidenceThreshold = confidenceThreshold;
  }

  async route({ request, guildId, targetUserIds = [] }) {
    const operations = {
      ...operationCriteria(this.catalog),
      [CONVERSATION]:
        'The user is talking, asking a question, requesting an explanation, or otherwise does not want a direct Discord API action.',
      [AMBIGUOUS]:
        'The user appears to want a Discord action, but the requested operation is not clear enough to execute safely.',
    };

    const response = await this.client.systemOne({
      state: {
        request,
        guildId,
        targetUserIds,
        instruction:
          'Interpret natural Discord administration language. Select the Discord API operation that directly satisfies the request. Do not invent an operation that is not listed.',
      },
      questions: {
        operation: choiceQuestion(
          'Which available Discord API operation best satisfies the user request?',
          operations,
        ),
        bodyField: choiceQuestion(
          'If the selected operation needs a request body field, which available field expresses the requested change? Otherwise choose none.',
          bodyFieldCriteria(this.catalog),
        ),
        clearBodyField: noulQuestion(
          'Does the user explicitly want to clear, remove, disable, or unset the selected request body field rather than set it?',
        ),
      },
    });

    const operationAnswer = response?.answers?.operation;
    const operationId = operationAnswer?.choice;
    const confidence = selectedProbability(operationAnswer);

    if (!operationId) {
      throw new Error('Jev response did not contain an operation choice');
    }

    if (operationId === CONVERSATION) {
      return { kind: 'conversation', confidence };
    }

    if (operationId === AMBIGUOUS || confidence < this.confidenceThreshold) {
      return {
        kind: 'clarification',
        confidence,
        message: 'I am not confident which Discord action you want. Please make the action explicit.',
      };
    }

    const operation = this.catalog.operations.find((item) => item.id === operationId);
    if (!operation) {
      throw new Error('Jev selected an unknown Discord API operation: ' + operationId);
    }

    const bodyFieldAnswer = response?.answers?.bodyField;
    const bodyFieldChoice = bodyFieldAnswer?.choice ?? 'none';
    const expectedPrefix = operation.id + ':';
    const selectedFieldName = bodyFieldChoice.startsWith(expectedPrefix)
      ? bodyFieldChoice.slice(expectedPrefix.length)
      : null;

    const bodyField = selectedFieldName
      ? (operation.bodyFields ?? []).find((field) => field.name === selectedFieldName) ?? null
      : null;

    return {
      kind: 'operation',
      confidence,
      operation,
      bodyField,
      clearBodyFieldProbability: Number(response?.answers?.clearBodyField?.noul ?? 0),
    };
  }
}

function selectedProbability(answer) {
  if (!answer) return 0;
  const probabilities = answer.probabilities ?? answer.probs ?? {};
  const value = probabilities?.[answer.choice] ?? answer.confidence ?? 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
