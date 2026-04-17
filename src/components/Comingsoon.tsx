type Props = { title: string; description?: string };

export default function ComingSoon({ title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-300">
      <div className="text-6xl">🚧</div>
      <div className="text-center">
        <h2 className="text-xl font-bold text-slate-600 mb-1">{title}</h2>
        <p className="text-sm text-slate-400">{description || 'อยู่ระหว่างพัฒนา — เร็วๆ นี้'}</p>
      </div>
      <div className="px-4 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs">
        Coming Soon
      </div>
    </div>
  );
}
