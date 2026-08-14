import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, EmptyState, SegmentedControl, Skeleton, SurfaceCard, TextArea } from '../components/ui';
import { PageHeader } from '../components/courtin/PageHeader';
import {
  AssistantApiError,
  askSupportAssistant,
  getAssistantSession,
  listAiMatchSuggestions,
  type AiMatchSuggestion,
  type AssistantSource,
} from '../lib/assistantApi';

type AssistantTab = 'suggestions' | 'chat';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  body: string;
  sources?: AssistantSource[];
  source?: 'gemini' | 'fallback' | 'safety';
  actionPath?: string;
}

const tabs = [
  { value: 'suggestions', label: 'Gợi ý kèo' },
  { value: 'chat', label: 'Chat hỗ trợ' },
] as const;

const starterQuestions = [
  'Chính sách hủy sân thế nào?',
  'Booking gần nhất của tôi khi nào?',
  'Hướng dẫn tôi mở luồng hủy booking',
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function standardActionPath(path?: string): string | undefined {
  if (path === '/players/me/bookings') return '/profile?tab=bookings';
  return undefined;
}

export function AssistantPage() {
  const session = getAssistantSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AssistantTab>('suggestions');
  const [suggestions, setSuggestions] = useState<AiMatchSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(Boolean(session?.roles.includes('player')));
  const [suggestionsError, setSuggestionsError] = useState('');
  const [passportRequired, setPassportRequired] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const loadSuggestions = async () => {
    if (!session?.roles.includes('player')) return;
    setSuggestionsLoading(true);
    setSuggestionsError('');
    setPassportRequired(false);
    try {
      const response = await listAiMatchSuggestions();
      setSuggestions(response.suggestions);
    } catch (cause) {
      if (cause instanceof AssistantApiError && cause.code === 'PASSPORT_REQUIRED') {
        setPassportRequired(true);
      } else {
        setSuggestionsError(cause instanceof Error ? cause.message : 'Không thể tải gợi ý kèo.');
      }
    } finally {
      setSuggestionsLoading(false);
    }
  };

  useEffect(() => {
    void loadSuggestions();
  }, []);

  const sendQuestion = async (event?: FormEvent) => {
    event?.preventDefault();
    const body = question.trim();
    if (!body || chatLoading || !session) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      body,
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    setChatLoading(true);
    try {
      const reply = await askSupportAssistant(body);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          body: reply.answer,
          sources: reply.sources,
          source: reply.source,
          actionPath: standardActionPath(reply.actionPath),
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          body: 'Trợ lý tạm bận, bạn vui lòng thử lại sau.',
          sources: [],
          source: 'fallback',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const askStarter = (value: string) => {
    setQuestion(value);
    setTab('chat');
  };

  return (
    <div className="page-container py-8 sm:py-10">
      <PageHeader eyebrow="Hỗ trợ có căn cứ" title="Trợ lý AI" description="Tìm kèo phù hợp hoặc hỏi chính sách và dữ liệu của chính bạn." actions={<SegmentedControl options={tabs} value={tab} onChange={setTab} />} />

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-info bg-info-bg p-3 text-sm text-ink-700">
        <span aria-hidden>ⓘ</span>
        <p>
          <strong>AI không tự thực hiện hành động.</strong> Mọi CTA chỉ mở luồng nghiệp vụ chuẩn để bạn tự kiểm tra và
          xác nhận.
        </p>
      </div>

      {!session ? (
        <div className="mt-6">
          <EmptyState
            title="Đăng nhập để dùng trợ lý"
            description="Trợ lý cần nhận diện tài khoản để chỉ truy xuất dữ liệu của chính bạn."
            action={<Button onClick={() => navigate('/auth')}>Đăng nhập</Button>}
          />
        </div>
      ) : !session.roles.includes('player') ? (
        <div className="mt-6">
          <EmptyState
            title="Trợ lý dành cho người chơi"
            description="Tài khoản hiện tại không có vai trò người chơi."
          />
        </div>
      ) : tab === 'suggestions' ? (
        <section className="mt-6" aria-label="Gợi ý kèo phù hợp">
          {suggestionsLoading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          ) : passportRequired ? (
            <EmptyState
              title="Khai báo trình độ để nhận gợi ý"
              description="Điểm phù hợp F-02 cần dữ liệu trong hồ sơ trình độ của bạn."
              action={<Button onClick={() => navigate('/passport')}>Mở hồ sơ trình độ</Button>}
            />
          ) : suggestionsError ? (
            <EmptyState
              title="Không thể tải gợi ý"
              description={suggestionsError}
              action={<Button onClick={() => void loadSuggestions()}>Thử lại</Button>}
            />
          ) : suggestions.length === 0 ? (
            <EmptyState
              title="Chưa có kèo phù hợp"
              description="Hãy thử lại khi có kèo mới hoặc mở danh sách kèo để điều chỉnh lựa chọn."
              action={<Button onClick={() => navigate('/matches')}>Xem tất cả kèo</Button>}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {suggestions.map((suggestion) => (
                <SuggestionCard key={suggestion.matchId} suggestion={suggestion} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-6" aria-label="Chat hỗ trợ">
          <SurfaceCard className="flex min-h-[620px] flex-col overflow-hidden p-0 sm:p-0">
            <div className="border-b border-line p-4 sm:p-5">
              <h2 className="text-h2">Chat hỗ trợ</h2>
              <p className="mt-1 text-sm text-ink-500">
                Nguồn trả lời chỉ gồm chính sách công khai và dữ liệu của chính tài khoản này.
              </p>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto bg-canvas/60 p-4 sm:p-5" aria-live="polite">
              {messages.length === 0 && (
                <div className="mx-auto max-w-xl py-8 text-center">
                  <p className="text-h3">Bạn cần hỗ trợ điều gì?</p>
                  <p className="mt-2 text-sm text-ink-500">Chọn một câu hỏi gợi ý hoặc nhập câu hỏi của bạn.</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {starterQuestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => askStarter(item)}
                        className="rounded-full border border-line bg-surface px-3 py-2 text-sm text-ink-700 hover:border-green-100 hover:bg-green-50"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
              {chatLoading && (
                <div className="w-fit rounded-2xl rounded-bl-md bg-surface px-4 py-3 text-sm text-ink-500 shadow-sm">
                  Trợ lý đang tìm nguồn<span className="animate-pulse">…</span>
                </div>
              )}
            </div>
            <form onSubmit={(event) => void sendQuestion(event)} className="border-t border-line bg-surface p-4 sm:p-5">
              <TextArea
                rows={3}
                maxLength={1000}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Hỏi về chính sách hoặc booking của bạn…"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-caption">{question.length} / 1.000</p>
                <Button type="submit" disabled={chatLoading || !question.trim()}>
                  {chatLoading ? 'Đang gửi…' : 'Gửi câu hỏi'}
                </Button>
              </div>
            </form>
          </SurfaceCard>
        </section>
      )}
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AiMatchSuggestion }) {
  return (
    <SurfaceCard hoverable className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption text-brand-navy">Điểm phù hợp F-02</p>
          <p className="text-figures mt-1 text-3xl font-bold text-brand-navy">{Math.round(suggestion.score)}</p>
        </div>
        <Badge tone={suggestion.source === 'fallback' ? 'warning' : 'success'}>
          {suggestion.source === 'fallback' ? 'Giải thích rút gọn' : 'Gemini có căn cứ'}
        </Badge>
      </div>
      <h2 className="mt-5 text-h3">
        {suggestion.match.venue.name} · {suggestion.match.court.name}
      </h2>
      <p className="mt-2 text-sm text-ink-500">
        {formatDate(suggestion.match.startAt)} · còn {suggestion.match.openSlots} chỗ
      </p>
      <p className="mt-4 flex-1 rounded-xl bg-canvas p-3 text-sm leading-6 text-ink-700">{suggestion.explanation}</p>
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-figures text-sm font-semibold">
          {Number(suggestion.match.feePerSlot).toLocaleString('vi-VN')}₫ / chỗ
        </p>
        <Link
          to={`/matches/${suggestion.matchId}`}
          className="inline-flex rounded-full bg-brand-yellow px-4 py-2.5 text-sm font-bold text-brand-navy transition hover:-translate-y-px hover:bg-brand-yellow-hover"
        >
          Xem kèo
        </Link>
      </div>
    </SurfaceCard>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const actionLabel = message.actionPath ? 'Mở booking của tôi' : undefined;
  return (
    <article className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[72%] ${message.role === 'user' ? 'rounded-br-md bg-brand-navy text-white' : 'rounded-bl-md bg-surface text-ink-700'}`}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
        {message.role === 'assistant' && (
          <>
            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Nguồn trả lời">
                {message.sources.map((source) => (
                  <span
                    key={source.id}
                    className="shrink-0 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink-500"
                  >
                    {source.title}
                  </span>
                ))}
              </div>
            )}
            {message.source === 'fallback' && (
              <p className="mt-2 text-xs font-semibold text-warning">Nguồn AI tạm thời không khả dụng</p>
            )}
            {message.actionPath && actionLabel && (
              <Link
                to={message.actionPath}
                className="mt-3 inline-flex rounded-full border border-brand-navy px-3 py-1.5 text-xs font-semibold text-brand-navy hover:bg-green-50"
              >
                {actionLabel}
              </Link>
            )}
          </>
        )}
      </div>
    </article>
  );
}
