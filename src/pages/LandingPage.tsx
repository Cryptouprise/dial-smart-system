import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Phone, Bot, Brain, Zap, BarChart3, Shield, ArrowRight, Play,
  CheckCircle2, TrendingUp, Clock, Users, Sparkles, Globe, ChevronRight,
  MessageSquare, Target, Layers, Star, Volume2, VolumeX
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

// ── Scroll reveal hook ──
const useScrollReveal = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('revealed'); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
};

// ── Animated counter hook ──
const useCounter = (end: number, duration = 2000) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = Date.now();
          const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);
  return { count, ref };
};

// ── Autoplay video component ──
const AutoplayVideo = ({ src, className = '', poster, objectFit = 'cover' }: { src: string; className?: string; poster?: string; objectFit?: 'cover' | 'contain' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (videoRef.current) {
          if (e.isIntersecting) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current.pause();
          }
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`relative group ${className}`}>
      <video
        ref={videoRef}
        src={src}
        muted={isMuted}
        loop
        playsInline
        poster={poster}
        className={`w-full h-full ${objectFit === 'contain' ? 'object-contain bg-black/90' : 'object-cover'} rounded-xl`}
      />
      <button
        onClick={() => {
          setIsMuted(prev => !prev);
          if (videoRef.current) videoRef.current.muted = !isMuted;
        }}
        className="absolute bottom-4 right-4 p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border/60 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
};

const features = [
  { icon: Brain, title: 'Autonomous AI Brain', description: 'Self-optimizing engine that learns from every call. Adjusts scripts, timing, and pacing in real-time.', accent: 'from-blue-500/20 to-purple-500/20' },
  { icon: Phone, title: 'Predictive Dialer', description: 'Multi-carrier support with Retell AI, Twilio & Telnyx. Adaptive pacing keeps your answer rates high.', accent: 'from-emerald-500/20 to-teal-500/20' },
  { icon: MessageSquare, title: 'AI SMS Engine', description: 'Context-aware conversations that nurture leads 24/7. A/B tests copy automatically and optimizes for replies.', accent: 'from-orange-500/20 to-amber-500/20' },
  { icon: Target, title: 'Lead Journey Intelligence', description: 'Every lead gets a personalized path. Sales psychology playbooks fire at the perfect moment.', accent: 'from-rose-500/20 to-pink-500/20' },
  { icon: BarChart3, title: 'Strategic Pattern Detection', description: '6 statistical algorithms discover what humans miss. Auto-generates rules from high-confidence insights.', accent: 'from-violet-500/20 to-indigo-500/20' },
  { icon: Shield, title: 'Enterprise Compliance', description: 'TCPA-compliant calling hours, DNC management, consent tracking, and full audit trails built in.', accent: 'from-cyan-500/20 to-sky-500/20' },
];

const problems = [
  { stat: '70%', label: "of a rep's day is non-selling activity", icon: Clock },
  { stat: '5min', label: 'is the window before a lead goes cold', icon: Zap },
  { stat: '$37K', label: 'average cost to replace a burned-out rep', icon: Users },
  { stat: '23%', label: 'of calls never get a retry attempt', icon: TrendingUp },
];

const testimonials = [
  { quote: "We went from 200 calls a day to 2,000 — with the same team. Call Boss doesn't just dial, it thinks.", author: "Director of Sales Operations", company: "Enterprise Solar Co.", stars: 5 },
  { quote: "The AI figured out Thursday 2pm converts 3.2x better than Monday mornings. We never would've caught that.", author: "VP of Sales", company: "National Insurance Group", stars: 5 },
  { quote: "Our lead-to-appointment rate doubled in 3 weeks. The perpetual follow-up system is a game changer.", author: "Call Center Manager", company: "Home Services Leader", stars: 5 },
];

const LandingPage = () => {
  const calls = useCounter(2000000, 2500);
  const leads = useCounter(450000, 2500);
  const rate = useCounter(340, 2000);
  const savings = useCounter(85, 2000);

  const revealROI = useScrollReveal();
  const revealVideo1 = useScrollReveal();
  const revealVideo2 = useScrollReveal();
  const revealPoster = useScrollReveal();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 hero-gradient pointer-events-none" />
      <div className="fixed inset-0 hero-gradient-accent pointer-events-none" />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-50" />

      {/* Navigation */}
      <nav className="relative z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Phone className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight">Call Boss</span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
              <a href="#proof" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Results</a>
              <a href="/showcase/landing.html" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Deep Dive</a>
              <a href="/showcase/blog-index.html" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</a>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button variant="ghost" size="sm" asChild><Link to="/auth">Log In</Link></Button>
              <Button size="sm" className="gap-2" asChild>
                <Link to="/demo"><Play className="h-3.5 w-3.5" />Live Demo</Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* ═══════════════════ HERO ═══════════════════ */}
      <section className="relative pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-5xl mx-auto">
            <div className="animate-fade-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/60 bg-muted/30 text-sm text-muted-foreground mb-8">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>6 AI Engines · 1 Autonomous Brain · Your Entire Sales Org — in One System</span>
            </div>
            <h1 className="animate-fade-up-delay-1 text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
              <span className="text-gradient-hero">Not Just an AI Agent.</span><br />
              <span className="text-gradient-accent">An Entire Sales Organization.</span>
            </h1>
            <p className="animate-fade-up-delay-2 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-6 leading-relaxed">
              Imagine an AI employee backed by a predictive dialer, SMS engine, lead journey intelligence, 
              calendar booking, workflow automation, and a self-optimizing brain that learns from every single interaction.
            </p>
            <p className="animate-fade-up-delay-2 text-base md:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
              <span className="text-foreground font-semibold">Industry templates. AI setup wizards. Autonomous follow-ups.</span>{' '}
              <span className="text-muted-foreground">Tell it your goal — it builds the campaign, dials the leads, nurtures the pipeline, and books the appointments.</span>
            </p>

            {/* Dual CTA — Education first */}
            <div className="animate-fade-up-delay-3 flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <Button size="lg" className="gap-2 text-base px-8 h-14 animate-glow-pulse" asChild>
                <a href="/showcase/landing.html">
                  <Layers className="h-4 w-4" />
                  See What Powers It
                </a>
              </Button>
              <Button size="lg" variant="outline" className="gap-2 text-base px-8 h-14" asChild>
                <Link to="/demo">
                  <Play className="h-4 w-4" />
                  Try the Live Demo
                </Link>
              </Button>
            </div>
            <p className="animate-fade-up-delay-3 text-xs text-muted-foreground mb-12">
              <span className="text-foreground font-medium">★ We recommend starting here</span> — see the full system, then try the demo from any page.
            </p>

            {/* Capability pills */}
            <div className="animate-fade-up-delay-4 flex flex-wrap justify-center gap-2 md:gap-3 mb-8">
              {[
                'Predictive Dialer', 'AI Voice Agents', 'SMS Nurturing', 'Calendar Booking',
                'Workflow Automation', 'Lead Scoring', 'Script A/B Testing', 'CRM Integration',
                'Number Health AI', 'Industry Templates'
              ].map(tag => (
                <span key={tag} className="px-3 py-1 rounded-full border border-border/60 bg-muted/20 text-xs text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>

            <div className="animate-fade-up-delay-4 flex flex-wrap justify-center gap-6 md:gap-10 text-muted-foreground text-sm">
              {['TCPA Compliant', 'Multi-Carrier', 'SOC 2 Ready', 'White-Label Ready'].map(t => (
                <div key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{t}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ POSTER VIDEO — SCROLL STOPPER ═══════════════════ */}
      <section className="relative py-8 md:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div ref={revealPoster} className="reveal-scale video-glow rounded-2xl overflow-hidden border border-border/40">
            <AutoplayVideo src="/videos/poster-animated.mp4" objectFit="contain" className="aspect-[9/16] sm:aspect-video w-full mx-auto" />
          </div>
        </div>
      </section>

      {/* ═══════════════════ STATS ═══════════════════ */}
      <section className="relative py-16 border-y border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div ref={calls.ref} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-gradient-accent">{calls.count.toLocaleString()}+</div>
              <div className="text-sm text-muted-foreground mt-1">AI Calls Processed</div>
            </div>
            <div ref={leads.ref} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-gradient-accent">{leads.count.toLocaleString()}+</div>
              <div className="text-sm text-muted-foreground mt-1">Leads Converted</div>
            </div>
            <div ref={rate.ref} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-gradient-accent">{rate.count}%</div>
              <div className="text-sm text-muted-foreground mt-1">Avg ROI Increase</div>
            </div>
            <div ref={savings.ref} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-gradient-accent">{savings.count}%</div>
              <div className="text-sm text-muted-foreground mt-1">Time Saved</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ ROI COMPARISON — VISUAL IMPACT ═══════════════════ */}
      <section className="relative py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              The Math <span className="text-gradient-accent">Doesn't Lie</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
              To make 2,000 calls a day you'd need <span className="font-semibold text-foreground">36 sales reps</span> at
              {' '}<span className="font-semibold text-foreground">$100/day each</span> — that's
              {' '}<span className="font-semibold text-gradient-accent">$3,600/day</span> before
              overhead, training, sick days, and turnover.
              <br className="hidden sm:block" />
              Call Boss does it for <span className="font-semibold text-gradient-accent">~$140/day</span> — 24/7, no breaks, no drama.
            </p>
          </div>
          <div ref={revealROI} className="reveal-scale">
            <div className="relative max-w-sm mx-auto rounded-2xl overflow-hidden border border-border/40 shadow-2xl">
              <img
                src="/videos/roi-comparison.png"
                alt="Human team at $3,600/day vs Call Boss AI at $140/day — 24/7, never sleeps, 2,000+ calls per day"
                className="w-full h-auto"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4 text-center">
                <Button className="gap-2" size="sm" asChild>
                  <a href="/showcase/roi.html">
                    Calculate Your Savings
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ PROBLEM ═══════════════════ */}
      <section className="relative py-24" id="how-it-works">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Your Revenue Is <span className="text-gradient-accent">Leaking</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Every dialer promises more calls. None of them solve the real problem.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {problems.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="glass-card p-6 text-center card-hover-lift">
                  <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-destructive/10 mb-4">
                    <Icon className="h-6 w-6 text-destructive" />
                  </div>
                  <div className="text-3xl font-bold mb-2">{item.stat}</div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-12">
            <Button variant="outline" className="gap-2" asChild>
              <a href="/showcase/problem.html">See All 6 Revenue Leaks<ChevronRight className="h-4 w-4" /></a>
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ VIDEO: COMPARISON ═══════════════════ */}
      <section className="relative py-24 border-y border-border/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-muted/30 text-xs text-muted-foreground mb-4">
                <Play className="h-3 w-3" /> Watch the Comparison
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                See How Call Boss <span className="text-gradient-accent">Stacks Up</span>
              </h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Side-by-side comparison of traditional dialing vs. the Call Boss autonomous engine. 
                More calls, smarter pacing, better results — in less time.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button className="gap-2" asChild>
                  <a href="/showcase/compare.html">Full Comparison<ArrowRight className="h-4 w-4" /></a>
                </Button>
              </div>
            </div>
            <div ref={revealVideo1} className="reveal-scale video-glow rounded-2xl overflow-hidden border border-border/40">
              <AutoplayVideo src="/videos/clip-comparison.mp4" className="aspect-video" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ FEATURES ═══════════════════ */}
      <section className="relative py-24" id="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border/60 bg-muted/30 text-sm text-muted-foreground mb-6">
              <Layers className="h-3.5 w-3.5" />6 Engines, 1 Brain
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Not a Dialer. <span className="text-gradient-accent">An Autonomous Sales Machine.</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Every feature works together. The AI learns from calls, SMS, and lead behavior to make smarter decisions every minute.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="glass-card p-6 card-hover-lift group">
                  <div className={`inline-flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br ${feature.accent} mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="h-6 w-6 text-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-12">
            <Button variant="outline" className="gap-2" asChild>
              <a href="/showcase/engines.html">Explore All Engines<ChevronRight className="h-4 w-4" /></a>
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ VIDEO: LIVE SIMULATION ═══════════════════ */}
      <section className="relative py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div ref={revealVideo2} className="reveal-scale video-glow rounded-2xl overflow-hidden border border-border/40 order-2 md:order-1">
              <AutoplayVideo src="/videos/clip-simulation.mp4" className="aspect-video" />
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-muted/30 text-xs text-muted-foreground mb-4">
                <Sparkles className="h-3 w-3 text-amber-400" /> Live Simulation
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Watch It <span className="text-gradient-accent">Think in Real-Time</span>
              </h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                This isn't a mockup. Watch the autonomous engine score leads, adjust pacing, 
                and route calls — all without human intervention.
              </p>
              <div className="space-y-3">
                {[
                  'Real-time lead scoring & prioritization',
                  'Adaptive call pacing based on answer rates',
                  'Automatic script A/B testing'
                ].map(item => (
                  <div key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ SOCIAL PROOF ═══════════════════ */}
      <section className="relative py-24 border-y border-border/40" id="proof">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Real Results. <span className="text-gradient-accent">Real Revenue.</span>
            </h2>
            <p className="text-muted-foreground text-lg">Based on 2 years of real-world campaign data.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="glass-card p-6 card-hover-lift flex flex-col">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <blockquote className="text-sm leading-relaxed mb-4 flex-1">"{t.quote}"</blockquote>
                <div>
                  <div className="text-sm font-medium">{t.author}</div>
                  <div className="text-xs text-muted-foreground">{t.company}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ VIDEO: DEMO CLIP ═══════════════════ */}
      <section className="relative py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            See the Full <span className="text-gradient-accent">Product Demo</span>
          </h2>
          <p className="text-muted-foreground mb-10 max-w-xl mx-auto">
            From lead upload to booked appointment — watch Call Boss handle the entire workflow.
          </p>
          <div className="video-glow rounded-2xl overflow-hidden border border-border/40 mx-auto">
            <AutoplayVideo src="/videos/clip-demo.mp4" className="aspect-video" />
          </div>
          <div className="mt-8">
            <Button size="lg" className="gap-2 px-8" asChild>
              <Link to="/demo"><Play className="h-4 w-4" />Try It Yourself</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ COMPARISON TEASER ═══════════════════ */}
      <section className="relative py-24 border-t border-border/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="glass-card-glow p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Every Dialer Has Its Place.{' '}
              <span className="text-gradient-accent">Ours Is First.</span>
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              VICIdial has hidden costs. GHL wasn't built for scale. Five9 charges enterprise prices.
              See how Call Boss stacks up — with transparent pricing at $0.15–$0.25/min.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button className="gap-2" asChild>
                <a href="/showcase/compare.html">View Full Comparison<ArrowRight className="h-4 w-4" /></a>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <a href="/showcase/roi.html">Calculate Your ROI<BarChart3 className="h-4 w-4" /></a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ FINAL CTA ═══════════════════ */}
      <section className="relative py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-8 animate-float">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Ready to Stop <span className="text-gradient-accent">Leaking Revenue?</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
            See Call Boss in action. No credit card. No sales pitch. Just a live demo that speaks for itself.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button size="lg" className="gap-2 text-base px-10 h-14 animate-glow-pulse" asChild>
              <Link to="/demo"><Play className="h-5 w-5" />Launch Live Demo</Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2 text-base px-10 h-14" asChild>
              <Link to="/auth">Sign Up Free<ArrowRight className="h-5 w-5" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ BLOG SECTION ═══════════════════ */}
      <section className="py-16 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs font-mono tracking-widest text-primary mb-3">// FROM THE BLOG</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">200+ Articles on AI Sales Automation</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">Industry strategies, ROI breakdowns, speed-to-lead data, and the playbooks top teams use to close more deals with AI.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 text-left">
            <a href="/showcase/templates/blog.html?post=the-call-that-never-gets-answered" className="block p-5 rounded-lg border border-border/60 bg-card hover:border-primary/40 transition-all hover:-translate-y-0.5">
              <span className="text-[10px] font-mono tracking-widest text-primary">LEGAL</span>
              <h3 className="font-bold mt-1 mb-2 leading-tight">The Call That Never Gets Answered</h3>
              <p className="text-xs text-muted-foreground">Why 60% of law firm leads go to voicemail — and the 5-second fix.</p>
            </a>
            <a href="/showcase/templates/blog.html?post=the-math-that-should-make-you-sick" className="block p-5 rounded-lg border border-border/60 bg-card hover:border-primary/40 transition-all hover:-translate-y-0.5">
              <span className="text-[10px] font-mono tracking-widest text-primary">DEBT & MCA</span>
              <h3 className="font-bold mt-1 mb-2 leading-tight">The Math That Should Make You Sick</h3>
              <p className="text-xs text-muted-foreground">Your debt leads cost $40 each and your callback rate is 8%. AI fixes both.</p>
            </a>
            <a href="/showcase/templates/blog.html?post=there-are-10000-ai-sales-tools-on-the-market-were-not-one-of-them" className="block p-5 rounded-lg border border-border/60 bg-card hover:border-primary/40 transition-all hover:-translate-y-0.5">
              <span className="text-[10px] font-mono tracking-widest text-primary">CROSS-INDUSTRY</span>
              <h3 className="font-bold mt-1 mb-2 leading-tight">We Didn't Build a Tool. We Built a Brain.</h3>
              <p className="text-xs text-muted-foreground">The difference between a drip sequence and a fully autonomous AI sales engine.</p>
            </a>
          </div>
          <a href="/showcase/blog-index.html" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
            Browse All 200+ Articles <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer className="border-t border-border/40 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-7 w-7 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Phone className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold">Call Boss</span>
              </div>
              <p className="text-xs text-muted-foreground">The AI-first autonomous dialer platform.</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Product</h4>
              <div className="space-y-2">
                <a href="/showcase/engines.html" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Engines</a>
                <a href="/showcase/compare.html" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Compare</a>
                <a href="/showcase/roi.html" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">ROI Calculator</a>
                <Link to="/demo" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Live Demo</Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Learn</h4>
              <div className="space-y-2">
                <a href="/showcase/problem.html" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">The Problem</a>
                <a href="/showcase/blog-index.html" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Blog</a>
                <a href="/showcase/" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Showcase Hub</a>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Account</h4>
              <div className="space-y-2">
                <Link to="/auth" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Sign In</Link>
                <Link to="/auth" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Create Account</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Call Boss. All rights reserved.</p>
            <p className="text-xs text-muted-foreground">Built for humans, not for AI.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
