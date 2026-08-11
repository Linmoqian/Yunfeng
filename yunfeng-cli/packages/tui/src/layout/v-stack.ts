import { Stack } from './stack.js';

export class VStack extends Stack {
	protected readonly layoutKind = 'vstack' as const;
}
