export type ChatRole = 'user' | 'agent';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

/**
 * Static, hard-coded sample conversation used only to demonstrate the layout
 * and styling (user vs agent bubbles). There is no state, fetching, or
 * mutation in this spec — these messages never change.
 */
export const sampleMessages: ChatMessage[] = [
  {
    id: 'sample-1',
    role: 'user',
    text: 'How much did I spend on groceries last month?',
  },
  {
    id: 'sample-2',
    role: 'agent',
    text: 'Here is a clear breakdown of your grocery spending, traceable to each transaction so you can see exactly where it went.',
  },
];
