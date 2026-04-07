import GraphicBoard from './GraphicBoard';
import GraphicTasks from './GraphicTasks';
import GraphicBrief from './GraphicBrief';
import GraphicAssets from './GraphicAssets';

type MarketingPage = 'graphic' | 'ads' | 'admin';
type GraphicSub = 'board' | 'tasks' | 'brief' | 'assets';

const GRAPHIC_SUBS: { key: GraphicSub; label: string; emoji: string }[] = [
  { key: 'board',  label: 'Board',        emoji: '📊' },
  { key: 'tasks',  label: 'รายการงาน',    emoji: '📋' },
  { key: 'brief',  label: 'สร้างงาน/Brief', emoji: '🆕' },
  { key: 'assets', label: 'คลัง Assets',  emoji: '🖼️' },
];

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm flex items-center justify-center">
      <div className="text-center">
        <p className="text-slate-500 font-medium text-lg">{title}</p>
        <p className="text-sm text-slate-400 mt-2">อยู่ระหว่างออกแบบ</p>
      </div>
    </div>
  );
}

export default function Marketing({ page }: { page: MarketingPage }) {
  return page === 'graphic' ? <GraphicModule /> : <Placeholder title={page === 'ads' ? 'โฆษณา ADS' : 'แอดมิน'} />;
}

function GraphicModule() {
  const sub = (new URLSearchParams(window.location.search).get('g') || 'board') as GraphicSub;
  const setSub = (k: GraphicSub) => {
    const url = new URL(window.location.href);
    url.searchParams.set('g', k);
    window.history.pushState({}, '', url);
    window.dispatchEvent(new Event('popstate'));
  };

  return (
    <div className="flex flex-col h-screen p-6 pb-2">
      <div className="shrink-0 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-pink-500 flex items-center justify-center text-white font-bold text-lg">G</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">ฝ่ายการตลาด / กราฟฟิก</h2>
          <p className="text-xs text-slate-400">จัดการงานกราฟฟิก · Brief · Assets</p>
        </div>
      </div>

      {/* Sub nav */}
      <div className="shrink-0 flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-4">
        {GRAPHIC_SUBS.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap
              ${sub === s.key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            <span style={{fontSize:'14px'}}>{s.emoji}</span> {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === 'board'  && <GraphicBoard />}
        {sub === 'tasks'  && <GraphicTasks onCreateNew={() => setSub('brief')} />}
        {sub === 'brief'  && <GraphicBrief onCreated={() => setSub('board')} />}
        {sub === 'assets' && <GraphicAssets />}
      </div>
    </div>
  );
}
