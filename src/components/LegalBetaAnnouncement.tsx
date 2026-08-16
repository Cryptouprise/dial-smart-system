import { Link } from 'react-router-dom';
import { ArrowRight, Scale, Sparkles } from 'lucide-react';

export const LegalBetaAnnouncement = () => (
  <Link
    to="/law-firms"
    className="fixed z-40 right-4 bottom-20 md:bottom-5 md:right-5 w-[calc(100%-2rem)] sm:w-auto sm:max-w-sm group"
    aria-label="Explore the new Law Firm AI Intake Beta"
  >
    <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-70 blur-sm group-hover:opacity-100 transition-opacity" />
    <div className="relative rounded-2xl border border-indigo-400/30 bg-background/95 backdrop-blur-xl shadow-2xl shadow-indigo-500/15 px-4 py-3 flex items-center gap-3 group-hover:-translate-y-0.5 transition-transform">
      <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
        <Scale className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.14em] text-indigo-300">
          <Sparkles className="h-3 w-3" />
          NEW · FOR LAW FIRMS
        </div>
        <div className="font-bold text-sm mt-0.5">After-Hours AI Intake Beta</div>
        <div className="text-[11px] text-muted-foreground truncate">Build a receptionist demo from your firm's website.</div>
      </div>
      <ArrowRight className="h-4 w-4 text-indigo-300 shrink-0 group-hover:translate-x-1 transition-transform" />
    </div>
  </Link>
);
