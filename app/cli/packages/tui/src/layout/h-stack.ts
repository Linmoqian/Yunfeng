import { Stack } from './stack.js';

export class HStack extends Stack {
	protected readonly layoutKind = 'hstack' as const;
}
