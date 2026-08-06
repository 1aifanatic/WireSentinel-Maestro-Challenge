import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UiPath } from '@uipath/uipath-typescript/core';
import {
  ConversationalAgent,
  MessageRole,
} from '@uipath/uipath-typescript/conversational-agent';
import type {
  ConversationGetResponse,
  SessionStream,
} from '@uipath/uipath-typescript/conversational-agent';
import type { ReviewCase } from './model';

export const DEFAULT_COPILOT_PROCESS_KEY = 'WireSentinelCopilotOperationalFinal.Agent.WireSentinelCopilot';

export type CopilotConnectionState = 'connecting' | 'ready' | 'thinking' | 'error';

type PendingExchange = {
  answer: string;
  resolve: (answer: string) => void;
  reject: (cause: Error) => void;
  timer: number;
};

type ReadyWaiter = {
  resolve: () => void;
  reject: (cause: Error) => void;
  timer: number;
};

export type WireSentinelCopilotOptions = {
  sdk: UiPath;
  reviewCase: ReviewCase;
  processKey?: string;
};

function reviewerPrompt(reviewCase: ReviewCase, question: string) {
  return [
    `CaseKey: ${reviewCase.caseId}`,
    `RequestId: ${reviewCase.requestId}`,
    `Reviewer question: ${question}`,
    'Use WireSentinelOperationalQuery before answering.',
    'Explain or draft only. Do not decide, submit, or claim that an action occurred.',
  ].join('\n');
}

function readableError(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  if (/401|unauthori[sz]ed/i.test(message)) {
    return 'Copilot authorization is missing. Sign out, sign in again, and retry the connection.';
  }
  if (/403|forbidden|scope/i.test(message)) {
    return 'The signed-in client is missing a required Conversational Agents scope.';
  }
  if (/websocket|connection|network/i.test(message)) {
    return 'The Copilot live connection could not be established. Retry the connection.';
  }
  return message.trim() || fallback;
}

export function useWireSentinelCopilot({
  sdk,
  reviewCase,
  processKey = DEFAULT_COPILOT_PROCESS_KEY,
}: WireSentinelCopilotOptions) {
  const service = useMemo(() => new ConversationalAgent(sdk), [sdk]);
  const conversationRef = useRef<ConversationGetResponse | null>(null);
  const sessionRef = useRef<SessionStream | null>(null);
  const readyRef = useRef(false);
  const readyWaitersRef = useRef<ReadyWaiter[]>([]);
  const pendingRef = useRef<PendingExchange | null>(null);
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<CopilotConnectionState>('connecting');
  const [statusLabel, setStatusLabel] = useState('Connecting to the grounded agent');
  const [agentLabel, setAgentLabel] = useState('WireSentinel Copilot');
  const [streamingText, setStreamingText] = useState('');

  const failReadyWaiters = useCallback((cause: Error) => {
    for (const waiter of readyWaitersRef.current) {
      window.clearTimeout(waiter.timer);
      waiter.reject(cause);
    }
    readyWaitersRef.current = [];
  }, []);

  const resolveReadyWaiters = useCallback(() => {
    for (const waiter of readyWaitersRef.current) {
      window.clearTimeout(waiter.timer);
      waiter.resolve();
    }
    readyWaitersRef.current = [];
  }, []);

  const finishPending = useCallback((cause?: Error) => {
    const pending = pendingRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingRef.current = null;
    if (cause) {
      pending.reject(cause);
      setState('error');
      setStatusLabel(readableError(cause, 'Copilot could not complete the response.'));
      return;
    }
    const answer = pending.answer.trim();
    if (!answer) {
      const emptyError = new Error('Copilot completed without returning a readable answer.');
      pending.reject(emptyError);
      setState('error');
      setStatusLabel(emptyError.message);
      return;
    }
    pending.resolve(answer);
    setStreamingText('');
    setState('ready');
    setStatusLabel('Grounded agent ready');
  }, []);

  useEffect(() => {
    let disposed = false;
    let localConversation: ConversationGetResponse | null = null;
    const cleanups: Array<() => void> = [];

    readyRef.current = false;
    setState('connecting');
    setStatusLabel('Resolving the approved WireSentinel agent');
    setStreamingText('');

    async function connect() {
      try {
        const agents = await service.getAll();
        if (disposed) return;

        const agent = agents.find((candidate) => candidate.processKey === processKey);
        if (!agent) {
          const available = agents
            .map((candidate) => `${candidate.name} (${candidate.processKey})`)
            .slice(0, 6)
            .join(', ');
          throw new Error(
            `The approved WireSentinel Copilot runtime was not found.${available ? ` Available agents: ${available}.` : ''}`,
          );
        }

        setAgentLabel(`${agent.name} · v${agent.processVersion}`);
        setStatusLabel('Opening a case-scoped conversation');
        localConversation = await agent.conversations.create({
          label: `Wire review · ${reviewCase.caseId}`,
          autogenerateLabel: false,
        });
        if (disposed) {
          localConversation.endSession();
          return;
        }

        conversationRef.current = localConversation;
        // Client-started exchanges are dispatched to the stream handlers only when
        // echo is enabled. The agent can otherwise finish successfully while the
        // cockpit receives none of its response chunks.
        const session = localConversation.startSession({ echo: true });
        sessionRef.current = session;

        cleanups.push(session.onSessionStarted(() => {
          if (disposed) return;
          readyRef.current = true;
          setState('ready');
          setStatusLabel('Grounded agent ready');
          resolveReadyWaiters();
        }));

        cleanups.push(session.onExchangeStart((exchange) => {
          if (!pendingRef.current) return;

          exchange.onMessageStart((message) => {
            if (!message.isAssistant) return;
            message.onContentPartStart((part) => {
              if (!part.isMarkdown && !part.isText) return;
              part.onChunk((chunk) => {
                const pending = pendingRef.current;
                if (!pending || !chunk.data) return;
                pending.answer += String(chunk.data);
                setStreamingText(pending.answer);
              });
            });
          });

          exchange.onExchangeEnd(() => {
            if (pendingRef.current?.answer.trim()) finishPending();
          });
        }));

        cleanups.push(session.onAnyErrorStart((event) => {
          const cause = new Error(
            readableError(event.message, 'The conversational agent returned an error.'),
          );
          if (pendingRef.current) finishPending(cause);
          else {
            readyRef.current = false;
            setState('error');
            setStatusLabel(cause.message);
            failReadyWaiters(cause);
          }
        }));

        cleanups.push(service.onConnectionStatusChanged((
          connectionState: 'Disconnected' | 'Connecting' | 'Connected',
          error: Error | null,
        ) => {
          if (disposed || connectionState !== 'Disconnected' || !error) return;
          const cause = new Error(readableError(error, 'The Copilot connection was interrupted.'));
          readyRef.current = false;
          if (pendingRef.current) finishPending(cause);
          else {
            setState('error');
            setStatusLabel(cause.message);
          }
        }));
      } catch (cause) {
        if (disposed) return;
        const error = new Error(readableError(cause, 'Unable to connect to WireSentinel Copilot.'));
        setState('error');
        setStatusLabel(error.message);
        failReadyWaiters(error);
      }
    }

    void connect();

    return () => {
      disposed = true;
      readyRef.current = false;
      for (const cleanup of cleanups) cleanup();
      const changed = new Error('The selected case changed before Copilot finished.');
      failReadyWaiters(changed);
      if (pendingRef.current) finishPending(changed);
      localConversation?.endSession();
      if (conversationRef.current === localConversation) conversationRef.current = null;
      sessionRef.current = null;
    };
  }, [
    failReadyWaiters,
    finishPending,
    generation,
    processKey,
    resolveReadyWaiters,
    reviewCase.caseId,
    service,
  ]);

  const waitUntilReady = useCallback(async () => {
    if (readyRef.current && sessionRef.current) return;
    if (state === 'error') throw new Error(statusLabel);
    await new Promise<void>((resolve, reject) => {
      const waiter: ReadyWaiter = {
        resolve,
        reject,
        timer: window.setTimeout(() => {
          readyWaitersRef.current = readyWaitersRef.current.filter((item) => item !== waiter);
          reject(new Error('Copilot did not establish a live session in time.'));
        }, 20000),
      };
      readyWaitersRef.current.push(waiter);
    });
  }, [state, statusLabel]);

  const ask = useCallback(async (question: string) => {
    if (pendingRef.current) throw new Error('Wait for the current Copilot response to finish.');
    await waitUntilReady();
    const session = sessionRef.current;
    if (!session) throw new Error('Copilot is not connected.');

    setStreamingText('');
    setState('thinking');
    setStatusLabel('Reading live case records and policy');

    return await new Promise<string>((resolve, reject) => {
      const pending: PendingExchange = {
        answer: '',
        resolve,
        reject,
        timer: window.setTimeout(() => {
          finishPending(new Error('Copilot did not respond within 90 seconds.'));
        }, 90000),
      };
      pendingRef.current = pending;

      try {
        const exchange = session.startExchange({
          exchangeId: `wiresentinel-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        });
        void exchange
          .sendMessageWithContentPart({
            data: reviewerPrompt(reviewCase, question),
            role: MessageRole.User,
          })
          .catch((cause) => finishPending(new Error(readableError(cause, 'Unable to send the Copilot question.'))));
      } catch (cause) {
        finishPending(new Error(readableError(cause, 'Unable to start the Copilot exchange.')));
      }
    });
  }, [finishPending, reviewCase, waitUntilReady]);

  const retry = useCallback(() => {
    if (pendingRef.current) return;
    setGeneration((current) => current + 1);
  }, []);

  return {
    ask,
    retry,
    state,
    statusLabel,
    agentLabel,
    streamingText,
  };
}
