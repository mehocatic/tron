import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  BITS,
  BitLayout,
  FLAVORS,
  HERO_BITS,
  INSIDE_STEPS,
  INTRO_VIDEO_URL,
  clamp,
  cubicBezier,
  hexToRgba,
  lerp,
  modFlavour,
  seededRand,
  sineEaseInOut,
  spriteStyle,
} from './stride-data';
import { BarState, StrideGlScene } from './stride-gl';

interface StormPiece {
  idx: number;
  useActiveBit: boolean;
  fallbackBit: number;
  angle: number;
  ph: number;
  spin: number;
  sizeFactor: number;
}

interface CartItem {
  id: number;
  label: string;
  price: string;
  cents: number;
}

const ARC_SLOTS = [
  { dx: 0, dy: 0, h: 430, rz: 0, ry: 0 },
  { dx: 245, dy: 24, h: 330, rz: 4, ry: 16 },
  { dx: 452, dy: 44, h: 312, rz: 8, ry: 26 },
  { dx: 660, dy: 80, h: 296, rz: 12, ry: 34 },
  { dx: 860, dy: 118, h: 280, rz: 15, ry: 40 },
];

const GLIDE_EASE = cubicBezier(0.25, 0.75, 0.2, 1);
const ENTRANCE_EASE = cubicBezier(0.16, 1, 0.3, 1);

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  // Template constants
  protected readonly flavors = FLAVORS;
  protected readonly heroBits = HERO_BITS;
  protected readonly introVideoUrl = INTRO_VIDEO_URL;
  protected readonly navItems = [
    { id: 'flavors', label: 'Flavors' },
    { id: 'inside', label: 'Inside' },
    { id: 'shop', label: 'Shop' },
    { id: 'range', label: 'Range' },
  ];

  protected readonly stormPieces: StormPiece[] = (() => {
    const rand = seededRand(424242);
    const out: StormPiece[] = [];
    for (let i = 0; i < 20; i++) {
      out.push({
        idx: i,
        useActiveBit: i % 10 < 7,
        fallbackBit: Math.floor(rand() * 5),
        angle: (i / 20) * Math.PI * 2 + (rand() - 0.5) * 0.45,
        ph: clamp(i / 20 + rand() * 0.03, 0, 1),
        spin: (rand() > 0.5 ? 1 : -1) * (180 + rand() * 180),
        sizeFactor: 0.7 + rand() * 0.7,
      });
    }
    return out;
  })();

  // View queries
  private readonly glCanvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('glCanvas');
  private readonly introElRef = viewChild<ElementRef<HTMLElement>>('introEl');
  private readonly introVideoRef = viewChild<ElementRef<HTMLVideoElement>>('introVideo');
  private readonly introStampElRef = viewChild<ElementRef<HTMLElement>>('introStampEl');

  private readonly navPillElRef = viewChild.required<ElementRef<HTMLElement>>('navPillEl');
  private readonly navHlElRef = viewChild.required<ElementRef<HTMLElement>>('navHlEl');
  private readonly navLinkEls = viewChildren<ElementRef<HTMLAnchorElement>>('navLinkEl');
  private readonly basketBtnRef = viewChild.required<ElementRef<HTMLButtonElement>>('basketBtn');
  private readonly badgeElRef = viewChild<ElementRef<HTMLElement>>('badgeEl');

  private readonly flavorsElRef = viewChild.required<ElementRef<HTMLElement>>('flavorsEl');
  private readonly revealElRef = viewChild.required<ElementRef<HTMLElement>>('revealEl');
  private readonly ringsElRef = viewChild.required<ElementRef<HTMLElement>>('ringsEl');
  private readonly bitEls = viewChildren<ElementRef<HTMLElement>>('bitEl');
  private readonly arcElRef = viewChild.required<ElementRef<HTMLElement>>('arcEl');
  private readonly playBtnRef = viewChild.required<ElementRef<HTMLButtonElement>>('playBtn');
  private readonly titleElRef = viewChild.required<ElementRef<HTMLHeadingElement>>('titleEl');
  private readonly countElRef = viewChild.required<ElementRef<HTMLElement>>('countEl');
  private readonly autoBtnRef = viewChild.required<ElementRef<HTMLButtonElement>>('autoBtn');

  private readonly insideElRef = viewChild.required<ElementRef<HTMLElement>>('insideEl');
  private readonly inDarkElRef = viewChild.required<ElementRef<HTMLElement>>('inDarkEl');
  private readonly inBackFrameRef = viewChild.required<ElementRef<HTMLElement>>('inBackFrame');
  private readonly inNumElRef = viewChild.required<ElementRef<HTMLElement>>('inNumEl');
  private readonly inBarElRef = viewChild.required<ElementRef<HTMLElement>>('inBarEl');
  private readonly inFrontElRef = viewChild.required<ElementRef<HTMLElement>>('inFrontEl');
  private readonly inFrontFrameRef = viewChild.required<ElementRef<HTMLElement>>('inFrontFrame');
  private readonly inHeadElRef = viewChild.required<ElementRef<HTMLElement>>('inHeadEl');
  private readonly inCapElRef = viewChild.required<ElementRef<HTMLElement>>('inCapEl');
  private readonly stormEls = viewChildren<ElementRef<HTMLElement>>('stormEl');

  private readonly shopElRef = viewChild.required<ElementRef<HTMLElement>>('shopEl');
  private readonly cardsElRef = viewChild.required<ElementRef<HTMLElement>>('cardsEl');
  private readonly cardEls = viewChildren<ElementRef<HTMLElement>>('cardEl');
  private readonly pkEls = viewChildren<ElementRef<HTMLElement>>('pkEl');

  private readonly rangeElRef = viewChild.required<ElementRef<HTMLElement>>('rangeEl');
  private readonly glowElRef = viewChild.required<ElementRef<HTMLElement>>('glowEl');

  // UI Signals
  protected readonly introVisible = signal(true);
  protected readonly introStamp = signal(false);
  protected readonly introHiding = signal(false);
  protected readonly navEntered = signal(false);
  protected readonly navTone = signal<'default' | 'light' | 'dark'>('default');
  protected readonly activeNavIndex = signal(0);

  protected readonly activeFlavor = signal(1); // Berry Oat
  protected readonly autoplay = signal(true);

  protected readonly insideStep = signal(0);
  protected readonly insideNum = computed(() => INSIDE_STEPS[this.insideStep()].num);
  protected readonly insideCap = computed(() => INSIDE_STEPS[this.insideStep()].cap);
  protected readonly insideHeadLines = computed(() => {
    const step = this.insideStep();
    if (step === 3) {
      const words = FLAVORS[this.activeFlavor()].name.toUpperCase().split(' ');
      return words.map((w) => ({ text: w, small: w.length > 9 }));
    }
    return INSIDE_STEPS[step].head.split('\n').map((w) => ({ text: w, small: false }));
  });

  protected readonly shopVisible = signal(false);
  protected readonly rangeHeadVisible = signal(false);

  // Builder state
  protected readonly packSlots = signal<(number | null)[]>([null, null, null]);
  protected readonly packAddedState = signal(false);
  protected readonly glowColor = signal('rgba(148, 189, 180, 0.72)');
  protected readonly packFilledCount = computed(
    () => this.packSlots().filter((v) => v !== null).length,
  );
  protected readonly packCounts = computed(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const v of this.packSlots()) {
      if (v !== null) counts[v]++;
    }
    return counts;
  });

  // Cart state
  protected readonly cartItems = signal<CartItem[]>([]);
  protected readonly cartCount = computed(() => this.cartItems().length);
  protected readonly cartOpen = signal(false);
  protected readonly cartTotalFormatted = computed(() => {
    const totalCents = this.cartItems().reduce((acc, item) => acc + item.cents, 0);
    return `$${(totalCents / 100).toFixed(2)}`;
  });

  // Internal runtime state (browser-only)
  private glScene: StrideGlScene | null = null;
  private rafId = 0;
  private lastFrameTime = 0;
  private vw = 1440;
  private vh = 900;
  private reducedMotion = false;
  private finePointer = true;

  // Intro state
  private introStarted = false;
  private introStamped = false;
  private heroEntered = false;
  private introTimers: number[] = [];

  // Hero carousel state
  private pos = -2.6;
  private target = 1;
  private heroInViewRatio = 1;
  private lastInteractionTime = 0;
  private slideTween: {
    active: boolean;
    from: number;
    to: number;
    start: number;
    dur: number;
    easeFn: (t: number) => number;
    swapped: boolean;
    newFlav: number;
    dir: number;
  } = {
    active: false,
    from: 1,
    to: 1,
    start: 0,
    dur: 650,
    easeFn: GLIDE_EASE,
    swapped: true,
    newFlav: 1,
    dir: 1,
  };

  // Colour reveal state
  private revealState: {
    active: boolean;
    start: number;
    dur: number;
    color: string;
  } = {
    active: false,
    start: 0,
    dur: 420,
    color: FLAVORS[1].color,
  };

  // Dragging state
  private dragState = {
    activePointerId: -1,
    dragging: false,
    downX: 0,
    pos0: 1,
    lastX: 0,
    lastT: 0,
    vel: 0,
  };

  // Smooth scrolling state
  private smoothScroll = {
    active: false,
    curr: 0,
    target: 0,
  };

  // Section 2 flip state
  private currentInsideStep = 0;
  private flipRy = 0;
  private flipTween = {
    active: false,
    from: 0,
    to: 0,
    start: 0,
    dur: 720,
  };
  private stepTextTimer1 = 0;
  private stepTextTimer2 = 0;

  // Shop / Traveller interaction state
  private liveCardTiltX = 0;
  private liveCardTiltY = 0;
  private pokeStart = -1;
  private phoneAutoCentered = false;
  private packTouched = false;
  private packAutoTimers: number[] = [];
  private cartSeq = 1;
  private buyResetTimer = 0;

  // Title measurement canvas
  private measureCtx: CanvasRenderingContext2D | null = null;
  private observers: IntersectionObserver[] = [];
  private cleanupFns: (() => void)[] = [];

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      this.initBrowser();
    });

    this.destroyRef.onDestroy(() => {
      this.cleanup();
    });
  }

  protected bitWidthCss(b: BitLayout): string {
    return this.vw < 820
      ? `calc(${b.sizeU * 1.3} * var(--u))`
      : `calc(${b.sizeU} * var(--u))`;
  }

  protected bitHeightCss(b: BitLayout): string {
    const box = BITS[b.bit];
    const ratio = box.h / box.w;
    return this.vw < 820
      ? `calc(${b.sizeU * 1.3 * ratio} * var(--u))`
      : `calc(${b.sizeU * ratio} * var(--u))`;
  }

  protected bitSpriteStyle(bitIndex: number) {
    return spriteStyle(BITS[bitIndex], 0);
  }

  protected wrapperSpriteStyle(flavIndex: number) {
    return spriteStyle(FLAVORS[flavIndex].box, 4);
  }

  protected stormPieceWidth(sp: StormPiece): number {
    const base = 0.085 * Math.min(this.vw, this.vh);
    return base * sp.sizeFactor;
  }

  protected stormPieceHeight(sp: StormPiece): number {
    const bitIdx = sp.useActiveBit ? FLAVORS[this.activeFlavor()].bit : sp.fallbackBit;
    const box = BITS[bitIdx];
    return this.stormPieceWidth(sp) * (box.h / box.w);
  }

  protected stormSpriteStyle(sp: StormPiece) {
    const bitIdx = sp.useActiveBit ? FLAVORS[this.activeFlavor()].bit : sp.fallbackBit;
    return spriteStyle(BITS[bitIdx], 0);
  }

  private initBrowser(): void {
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (this.reducedMotion) {
      this.autoplay.set(false);
    }

    // Init Three.js WebGL
    const canvas = this.glCanvasRef().nativeElement;
    try {
      this.glScene = new StrideGlScene(canvas);
      document.body.classList.add('gl');
      void this.glScene.loadAssets();
    } catch {
      this.glScene = null;
    }

    // Context loss safety
    const onContextLost = (e: Event) => e.preventDefault();
    canvas.addEventListener('webglcontextlost', onContextLost);
    this.cleanupFns.push(() => canvas.removeEventListener('webglcontextlost', onContextLost));

    // Setup initial title & counter
    this.renderTitleImmediate(FLAVORS[1].name);
    this.countElRef().nativeElement.textContent = '02';

    // Re-measure title & nav highlight after fonts load
    void document.fonts.ready.then(() => {
      this.updateTitleFontSize(FLAVORS[this.activeFlavor()].name);
      this.updateNavHighlight();
    });

    // Resize listener
    const onResize = () => {
      this.vw = window.innerWidth;
      this.vh = window.innerHeight;
      this.glScene?.resize(this.vw, this.vh);
      this.updateTitleFontSize(FLAVORS[this.activeFlavor()].name);
      this.updateNavHighlight();
    };
    window.addEventListener('resize', onResize, { passive: true });
    this.cleanupFns.push(() => window.removeEventListener('resize', onResize));

    // Keyboard navigation
    const onKeyDown = (e: KeyboardEvent) => {
      this.smoothScroll.active = false;
      if (!this.heroEntered) return;
      if (this.heroInViewRatio >= 0.5) {
        if (e.key === 'ArrowRight') {
          this.noteInteraction();
          this.stepFlavour(1);
        } else if (e.key === 'ArrowLeft') {
          this.noteInteraction();
          this.stepFlavour(-1);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    this.cleanupFns.push(() => window.removeEventListener('keydown', onKeyDown));

    // Wheel smooth scroll (desktop mouse/trackpad)
    const onWheel = (e: WheelEvent) => {
      if (this.reducedMotion) return;
      if (document.body.classList.contains('locked')) return;
      if (e.ctrlKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;
      else if (e.deltaMode === 2) dy *= window.innerHeight;

      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (!this.smoothScroll.active) {
        this.smoothScroll.curr = window.scrollY;
        this.smoothScroll.target = window.scrollY;
        this.smoothScroll.active = true;
      }
      this.smoothScroll.target = clamp(this.smoothScroll.target + dy, 0, maxScroll);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    this.cleanupFns.push(() => window.removeEventListener('wheel', onWheel));

    // Pointer down cancels smooth scroll so scrollbar drag works natively
    const onGlobalPointerDown = () => {
      this.smoothScroll.active = false;
    };
    window.addEventListener('pointerdown', onGlobalPointerDown, { passive: true });
    this.cleanupFns.push(() => window.removeEventListener('pointerdown', onGlobalPointerDown));

    // Observers
    this.setupObservers();

    // Start Intro or skip immediately for reduced motion
    if (this.reducedMotion) {
      this.pos = 1;
      this.target = 1;
      this.introVisible.set(false);
      this.enterHero(true);
    } else {
      document.body.classList.add('locked');
      this.startIntroSequence();
    }

    // Start unified RAF loop
    this.lastFrameTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, Math.max(1, now - this.lastFrameTime));
      this.lastFrameTime = now;
      this.onFrame(now, dt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private setupObservers(): void {
    const heroObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.heroInViewRatio = entry.intersectionRatio;
        }
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] },
    );
    heroObs.observe(this.flavorsElRef().nativeElement);
    this.observers.push(heroObs);

    const shopObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.18) {
            this.shopVisible.set(true);
            shopObs.disconnect();
          }
        }
      },
      { threshold: [0.18] },
    );
    shopObs.observe(this.shopElRef().nativeElement);
    this.observers.push(shopObs);

    const rangeObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.rangeHeadVisible.set(true);
            if (!this.packTouched && entry.intersectionRatio >= 0.3) {
              this.autoFillPack();
            }
          }
        }
      },
      { threshold: [0.15, 0.3] },
    );
    rangeObs.observe(this.rangeElRef().nativeElement);
    this.observers.push(rangeObs);
  }

  private autoFillPack(): void {
    if (this.packTouched || this.packAutoTimers.length > 0) return;
    const base = this.activeFlavor();
    const picks = [base, (base + 1) % 5, (base + 2) % 5];
    const delays = this.reducedMotion ? [0, 0, 0] : [250, 410, 570];
    picks.forEach((flav, idx) => {
      const t = window.setTimeout(() => {
        if (this.packTouched) return;
        this.setPackSlot(idx, flav, true);
      }, delays[idx]);
      this.packAutoTimers.push(t);
    });
  }

  // ==================== INTRO SEQUENCE ====================

  private startIntroSequence(): void {
    const vid = this.introVideoRef()?.nativeElement;
    if (vid) {
      vid.muted = true;
      if (vid.readyState >= 3) {
        this.playIntroFromOffset(vid);
      }
    }

    // If playback hasn't started after 3.5s, trigger logo stamp
    this.introTimers.push(
      window.setTimeout(() => {
        if (!this.introStarted && !this.introStamped && !this.heroEntered) {
          this.triggerIntroStamp();
        }
      }, 3500),
    );

    // Failsafe: enter hero after 9s
    this.introTimers.push(
      window.setTimeout(() => {
        if (!this.heroEntered) {
          this.enterHero(false);
        }
      }, 9000),
    );
  }

  protected onIntroCanPlay(): void {
    const vid = this.introVideoRef()?.nativeElement;
    if (!vid || this.introStarted || this.introStamped || this.heroEntered) return;
    this.playIntroFromOffset(vid);
  }

  private playIntroFromOffset(vid: HTMLVideoElement): void {
    if (this.introStarted) return;
    this.introStarted = true;
    try {
      vid.currentTime = 0.55;
      const p = vid.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          this.triggerIntroStamp();
        });
      }
    } catch {
      this.triggerIntroStamp();
    }
  }

  protected onIntroTimeUpdate(): void {
    const vid = this.introVideoRef()?.nativeElement;
    if (!vid || this.introStamped || this.heroEntered) return;
    if (vid.currentTime >= 4.6) {
      this.triggerIntroStamp();
    }
  }

  protected onIntroVideoEnd(): void {
    if (!this.introStamped && !this.heroEntered) {
      this.triggerIntroStamp();
    }
  }

  protected onIntroVideoError(): void {
    if (!this.introStamped && !this.heroEntered) {
      this.triggerIntroStamp();
    }
  }

  private triggerIntroStamp(): void {
    if (this.introStamped || this.heroEntered) return;
    this.introStamped = true;
    const vid = this.introVideoRef()?.nativeElement;
    if (vid) {
      try {
        vid.pause();
      } catch {
        // ignore
      }
    }
    this.introStamp.set(true);

    requestAnimationFrame(() => {
      const stampEl = this.introStampElRef()?.nativeElement;
      if (stampEl && !this.reducedMotion) {
        stampEl.animate(
          [
            { transform: 'scale(0.72)', opacity: 0 },
            { transform: 'scale(1.04)', opacity: 1, offset: 0.7 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: 380, easing: 'ease-out', fill: 'forwards' },
        );
      }
    });

    this.introTimers.push(
      window.setTimeout(() => {
        this.enterHero(false);
      }, 380 + 650),
    );
  }

  protected skipIntro(): void {
    this.enterHero(true);
  }

  private enterHero(instant: boolean): void {
    if (this.heroEntered) return;
    this.heroEntered = true;
    for (const id of this.introTimers) window.clearTimeout(id);
    this.introTimers = [];

    document.body.classList.remove('locked');

    if (instant || this.reducedMotion) {
      this.introVisible.set(false);
    } else {
      this.introHiding.set(true);
      window.setTimeout(() => this.introVisible.set(false), 360);
    }

    this.lastInteractionTime = performance.now();

    // Nav entrance
    const navEl = this.navElRef();
    if (instant || this.reducedMotion) {
      this.navEntered.set(true);
      navEl.style.transform = 'translateY(0)';
    } else {
      navEl.animate(
        [{ transform: 'translateY(-110%)' }, { transform: 'translateY(0)' }],
        { duration: 900, easing: 'cubic-bezier(0.22, 0.9, 0.24, 1)', fill: 'forwards' },
      );
      this.navEntered.set(true);
    }
    requestAnimationFrame(() => this.updateNavHighlight());

    // Rings entrance
    const rings = this.ringsElRef().nativeElement;
    if (instant || this.reducedMotion) {
      rings.style.opacity = '1';
      rings.style.transform = 'translate(-50%, -50%) scale(1)';
    } else {
      rings.animate(
        [
          { opacity: 0, transform: 'translate(-50%, -50%) scale(0.85)' },
          { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        ],
        { duration: 1100, easing: 'ease-out', fill: 'forwards' },
      );
    }

    // Play, count, auto fade-in
    const play = this.playBtnRef().nativeElement;
    const count = this.countElRef().nativeElement;
    const auto = this.autoBtnRef().nativeElement;
    if (instant || this.reducedMotion) {
      play.style.opacity = '1';
      count.style.opacity = '1';
      auto.style.opacity = '1';
    } else {
      [
        { el: play, delay: 500 },
        { el: count, delay: 620 },
        { el: auto, delay: 740 },
      ].forEach(({ el, delay }) => {
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 600,
          delay,
          easing: 'ease-out',
          fill: 'forwards',
        });
      });
    }

    // Bars sweep in on arc: pos -2.6 -> 1 over 1700ms
    if (instant || this.reducedMotion) {
      this.pos = 1;
      this.target = 1;
      this.slideTween.active = false;
    } else {
      this.pos = -2.6;
      this.target = 1;
      this.slideTween = {
        active: true,
        from: -2.6,
        to: 1,
        start: performance.now(),
        dur: 1700,
        easeFn: ENTRANCE_EASE,
        swapped: true,
        newFlav: 1,
        dir: 1,
      };
    }

    // Floating bits fade + composite-add drift
    const bits = this.bitEls();
    bits.forEach((ref, i) => {
      const el = ref.nativeElement;
      if (this.reducedMotion) {
        el.style.opacity = '0.55';
        return;
      }
      el.animate([{ opacity: 0 }, { opacity: 0.6 }], {
        duration: 900,
        delay: instant ? 0 : 300 + 90 * i,
        easing: 'ease-out',
        fill: 'forwards',
      });

      const dx = (i % 2 === 0 ? 1 : -1) * (12 + (i % 3));
      const dy = -(22 + 3 * i);
      const dr = (i % 2 === 0 ? 1 : -1) * (10 + (i % 3));
      el.animate(
        [
          { transform: 'translate(0px, 0px) rotate(0deg)' },
          { transform: `translate(${dx}px, ${dy}px) rotate(${dr}deg)` },
          { transform: 'translate(0px, 0px) rotate(0deg)' },
        ],
        {
          duration: 7000 + 900 * i,
          iterations: Infinity,
          easing: 'ease-in-out',
          composite: 'add',
        },
      );
    });
  }

  private navElRef(): HTMLElement {
    return this.navPillElRef().nativeElement.closest('nav') as HTMLElement;
  }

  // ==================== HERO CAROUSEL & INTERACTION ====================

  private noteInteraction(): void {
    this.lastInteractionTime = performance.now();
  }

  protected toggleAutoplay(): void {
    this.noteInteraction();
    this.autoplay.update((v) => !v);
  }

  protected stepFlavour(delta: number): void {
    this.noteInteraction();
    this.goTo(this.target + delta);
  }

  private goTo(newTarget: number, customDuration?: number): void {
    const prevTarget = this.target;
    const dir = newTarget >= prevTarget ? 1 : -1;
    this.target = newTarget;
    const newFlav = modFlavour(newTarget);
    const extraSlots = Math.max(0, Math.round(Math.abs(newTarget - prevTarget)) - 1);
    const dur = customDuration ?? 650 + 160 * extraSlots;

    if (this.reducedMotion) {
      this.pos = newTarget;
      this.slideTween.active = false;
      if (newFlav !== this.activeFlavor()) {
        this.triggerFlavourChange(newFlav, dir, true);
      }
      return;
    }

    this.slideTween = {
      active: true,
      from: this.pos,
      to: newTarget,
      start: performance.now(),
      dur,
      easeFn: GLIDE_EASE,
      swapped: false,
      newFlav,
      dir,
    };
  }

  private triggerFlavourChange(newFlav: number, dir: number, instant: boolean): void {
    const prevFlav = this.activeFlavor();
    if (prevFlav === newFlav) return;
    this.activeFlavor.set(newFlav);

    const newColor = FLAVORS[newFlav].color;
    const revealEl = this.revealElRef().nativeElement;

    if (instant || this.reducedMotion) {
      this.revealState.active = false;
      document.documentElement.style.setProperty('--flav', newColor);
      document.documentElement.style.setProperty('--rv', 'transparent');
      revealEl.style.maskImage = '';
      revealEl.style.webkitMaskImage = '';
      this.renderTitleImmediate(FLAVORS[newFlav].name);
      this.countElRef().nativeElement.textContent = `0${newFlav + 1}`;
    } else {
      // Finish any running reveal first
      if (this.revealState.active) {
        document.documentElement.style.setProperty('--flav', this.revealState.color);
      }
      this.revealState = {
        active: true,
        start: performance.now(),
        dur: 420,
        color: newColor,
      };
      document.documentElement.style.setProperty('--rv', newColor);

      this.animateTitleSwap(FLAVORS[newFlav].name, dir);
      this.animateCounterSwap(`0${newFlav + 1}`);
    }

    // If section 2 is on step 04, crossfade its headline to new flavour name
    if (this.currentInsideStep === 3 && !instant && !this.reducedMotion) {
      const headEl = this.inHeadElRef().nativeElement;
      headEl.animate(
        [
          { translate: '0 0', opacity: 1 },
          { translate: '0 -10px', opacity: 0 },
        ],
        { duration: 240, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
      );
      window.setTimeout(() => {
        headEl.animate(
          [
            { translate: '0 14px', opacity: 0 },
            { translate: '0 0', opacity: 1 },
          ],
          { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
        );
      }, 40);
    }
  }

  private getMeasureCtx(): CanvasRenderingContext2D | null {
    if (!this.measureCtx) {
      const c = document.createElement('canvas');
      this.measureCtx = c.getContext('2d');
    }
    return this.measureCtx;
  }

  private updateTitleFontSize(name: string): void {
    const titleEl = this.titleElRef().nativeElement;
    const ctx = this.getMeasureCtx();
    const upper = name.toUpperCase();
    let w = 450;
    let maxWordW = 300;
    if (ctx) {
      ctx.font = '400 100px "Archivo Black", sans-serif';
      w = Math.max(100, ctx.measureText(upper).width);
      const words = upper.split(' ');
      maxWordW = Math.max(...words.map((wd) => ctx.measureText(wd).width), 80);
    }

    if (this.vw >= 820) {
      const u = Math.min(this.vw / 1440, this.vh / 900);
      const size = Math.min(96 * u, (760 * u * 100) / w);
      titleEl.style.fontSize = `${size.toFixed(2)}px`;
    } else if (this.vw > this.vh) {
      const size = Math.min(36, ((this.vw - 36) * 100) / maxWordW);
      titleEl.style.fontSize = `${size.toFixed(2)}px`;
    } else {
      const base = clamp(40, 0.125 * this.vw, 64);
      const size = Math.min(base, ((this.vw - 36) * 100) / maxWordW);
      titleEl.style.fontSize = `${size.toFixed(2)}px`;
    }
  }

  private buildTitleLayer(name: string): { layer: HTMLSpanElement; chars: HTMLSpanElement[] } {
    const layer = document.createElement('span');
    layer.className = 'title-layer';
    const chars: HTMLSpanElement[] = [];
    const words = name.toUpperCase().split(' ');
    for (const word of words) {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'title-word';
      for (const ch of word) {
        const wrap = document.createElement('span');
        wrap.className = 'title-char-wrap';
        const c = document.createElement('span');
        c.className = 'title-char';
        c.textContent = ch;
        wrap.appendChild(c);
        wordSpan.appendChild(wrap);
        chars.push(c);
      }
      layer.appendChild(wordSpan);
    }
    return { layer, chars };
  }

  private renderTitleImmediate(name: string): void {
    const titleEl = this.titleElRef().nativeElement;
    titleEl.innerHTML = '';
    const { layer } = this.buildTitleLayer(name);
    titleEl.appendChild(layer);
    this.updateTitleFontSize(name);
  }

  private animateTitleSwap(name: string, dir: number): void {
    const titleEl = this.titleElRef().nativeElement;
    const oldLayers = Array.from(titleEl.querySelectorAll('.title-layer')) as HTMLElement[];

    for (const ol of oldLayers) {
      if (ol.classList.contains('outgoing')) {
        ol.remove();
        continue;
      }
      ol.classList.add('outgoing');
      const oldChars = Array.from(ol.querySelectorAll('.title-char')) as HTMLElement[];
      oldChars.forEach((ch, idx) => {
        ch.animate(
          [
            { transform: 'translateY(0%)', opacity: 1 },
            { transform: `translateY(${-110 * dir}%)`, opacity: 0 },
          ],
          {
            duration: 300,
            delay: idx * 11,
            easing: 'cubic-bezier(0.45, 0, 0.75, 0.3)',
            fill: 'forwards',
          },
        );
      });
      window.setTimeout(() => ol.remove(), 350 + oldChars.length * 11);
    }

    this.updateTitleFontSize(name);
    const { layer, chars } = this.buildTitleLayer(name);
    titleEl.appendChild(layer);

    chars.forEach((ch, idx) => {
      ch.animate(
        [
          { transform: `translateY(${110 * dir}%)`, opacity: 0 },
          { transform: 'translateY(0%)', opacity: 1 },
        ],
        {
          duration: 620,
          delay: 120 + idx * 22,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'backwards',
        },
      );
    });
  }

  private animateCounterSwap(text: string): void {
    const el = this.countElRef().nativeElement;
    el.animate(
      [
        { translate: '0 0', opacity: 1 },
        { translate: '0 -10px', opacity: 0 },
      ],
      { duration: 220, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
    );

    window.setTimeout(() => {
      el.textContent = text;
      el.animate(
        [
          { translate: '0 14px', opacity: 0 },
          { translate: '0 0', opacity: 1 },
        ],
        { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
      );
    }, 60);
  }

  // Dragging & Pointer handlers on .arc
  protected onArcPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.noteInteraction();
    this.dragState = {
      activePointerId: e.pointerId,
      dragging: false,
      downX: e.clientX,
      pos0: this.pos,
      lastX: e.clientX,
      lastT: performance.now(),
      vel: 0,
    };
  }

  protected onArcPointerMove(e: PointerEvent): void {
    if (this.dragState.activePointerId !== e.pointerId) return;
    this.noteInteraction();
    const { u, xSpread } = this.getHeroMetrics();
    const slotPx = Math.max(40, 245 * u * xSpread);

    if (!this.dragState.dragging && Math.abs(e.clientX - this.dragState.downX) > 6) {
      this.dragState.dragging = true;
      this.slideTween.active = false;
      try {
        this.arcElRef().nativeElement.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      document.body.classList.add('dragging');
    }

    if (this.dragState.dragging) {
      const now = performance.now();
      const dt = Math.max(1, now - this.dragState.lastT);
      const sv = (-(e.clientX - this.dragState.lastX) / slotPx) / dt;
      this.dragState.vel = this.dragState.vel * 0.6 + sv * 0.4;
      this.pos = this.dragState.pos0 - (e.clientX - this.dragState.downX) / slotPx;
      this.dragState.lastX = e.clientX;
      this.dragState.lastT = now;
    }
  }

  protected onArcPointerUp(e: PointerEvent): void {
    if (this.dragState.activePointerId !== e.pointerId) return;
    const wasDragging = this.dragState.dragging;
    this.endArcDrag(e.pointerId);

    if (wasDragging) {
      const to = Math.round(this.pos + clamp(this.dragState.vel * 220, -2, 2));
      const dur = Math.max(380, 650 * Math.min(1, Math.abs(to - this.pos) + 0.35));
      this.goTo(to, dur);
    } else {
      const hit = this.glScene?.pickBar(e.clientX, e.clientY);
      if (hit && hit.barIndex !== Math.round(this.target)) {
        this.noteInteraction();
        this.goTo(hit.barIndex);
      }
    }
  }

  protected onArcPointerCancel(e: PointerEvent): void {
    if (this.dragState.activePointerId !== e.pointerId) return;
    const wasDragging = this.dragState.dragging;
    this.endArcDrag(e.pointerId);
    if (wasDragging) {
      const to = Math.round(this.pos + clamp(this.dragState.vel * 220, -2, 2));
      if (Math.abs(to - this.pos) > 0.02) {
        const dur = Math.max(380, 650 * Math.min(1, Math.abs(to - this.pos) + 0.35));
        this.goTo(to, dur);
      } else {
        this.pos = to;
        this.target = to;
      }
    }
  }

  private endArcDrag(pointerId: number): void {
    this.dragState.activePointerId = -1;
    this.dragState.dragging = false;
    document.body.classList.remove('dragging');
    try {
      this.arcElRef().nativeElement.releasePointerCapture(pointerId);
    } catch {
      // ignore
    }
  }

  protected onArcMouseMove(e: MouseEvent): void {
    if (this.dragState.dragging) return;
    const hit = this.glScene?.pickBar(e.clientX, e.clientY);
    this.arcElRef().nativeElement.style.cursor = hit ? 'pointer' : 'grab';
  }

  // ==================== SECTION 2: INSIDE ====================

  protected jumpToInsideStep(stepIdx: number): void {
    const inside = this.insideElRef().nativeElement;
    const maxScroll = inside.offsetHeight - this.vh;
    const targetP = (stepIdx + 0.5) * 0.19;
    const y = inside.offsetTop + targetP * maxScroll;
    this.smoothScroll.active = false;
    window.scrollTo({ top: y, behavior: this.reducedMotion ? 'auto' : 'smooth' });
  }

  private triggerInsideStep(newStep: number): void {
    if (newStep === this.currentInsideStep) return;
    this.currentInsideStep = newStep;

    const targetRy = INSIDE_STEPS[newStep].ry;
    if (this.reducedMotion) {
      this.flipRy = targetRy;
      this.flipTween.active = false;
      this.insideStep.set(newStep);
      return;
    }

    const halfTurns = clamp(Math.abs(targetRy - this.flipRy) / 180, 0.4, 2);
    const dur = 720 * halfTurns;
    this.flipTween = {
      active: true,
      from: this.flipRy,
      to: targetRy,
      start: performance.now(),
      dur,
    };

    window.clearTimeout(this.stepTextTimer1);
    window.clearTimeout(this.stepTextTimer2);

    const els = [
      this.inHeadElRef().nativeElement,
      this.inNumElRef().nativeElement,
      this.inCapElRef().nativeElement,
    ];
    const swapDelay = 0.38 * Math.min(dur, 720);

    this.stepTextTimer1 = window.setTimeout(() => {
      els.forEach((el) => {
        el.animate(
          [
            { translate: '0 0', opacity: 1 },
            { translate: '0 -10px', opacity: 0 },
          ],
          { duration: 240, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
        );
      });

      this.stepTextTimer2 = window.setTimeout(() => {
        this.insideStep.set(newStep);
        els.forEach((el) => {
          el.animate(
            [
              { translate: '0 14px', opacity: 0 },
              { translate: '0 0', opacity: 1 },
            ],
            { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
          );
        });
      }, 40);
    }, swapDelay);
  }

  // ==================== SECTION 3: SHOP ====================

  protected onCardMouseMove(e: MouseEvent, idx: number): void {
    if (!this.finePointer) return;
    const card = this.cardEls()[idx]?.nativeElement;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.classList.add('tilting');
    card.style.transform = `translateY(-8px) rotateX(${(-y * 12).toFixed(2)}deg) rotateY(${(x * 12).toFixed(2)}deg)`;
    if (idx === this.activeFlavor()) {
      this.liveCardTiltX = x;
      this.liveCardTiltY = y;
    }
  }

  protected onCardMouseLeave(idx: number): void {
    const card = this.cardEls()[idx]?.nativeElement;
    if (!card) return;
    card.classList.remove('tilting');
    card.style.transform = '';
    if (idx === this.activeFlavor()) {
      this.liveCardTiltX = 0;
      this.liveCardTiltY = 0;
    }
  }

  protected onCardPointerDown(idx: number): void {
    const card = this.cardEls()[idx]?.nativeElement;
    if (!card) return;
    card.style.transform = `${card.style.transform || ''} scale(0.97)`.trim();
  }

  protected onCardPointerUp(idx: number): void {
    const card = this.cardEls()[idx]?.nativeElement;
    if (!card) return;
    card.style.transform = card.style.transform.replace(/\s*scale\(0\.97\)/g, '');
  }

  protected pokeCard(idx: number): void {
    if (idx === this.activeFlavor()) {
      this.pokeStart = performance.now();
      return;
    }
    const pk = this.pkEls()[idx]?.nativeElement;
    if (!pk || this.reducedMotion) return;
    pk.animate(
      [
        { transform: 'translateZ(30px) scale(1, 1)' },
        { transform: 'translateZ(30px) scale(1.06, 0.93)', offset: 0.3 },
        { transform: 'translateZ(30px) scale(0.97, 1.04)', offset: 0.6 },
        { transform: 'translateZ(30px) scale(1, 1)' },
      ],
      { duration: 500, easing: 'ease-out' },
    );
  }

  protected addBagFromCard(e: Event, idx: number): void {
    e.stopPropagation();
    const pk = this.pkEls()[idx]?.nativeElement;
    const flav = FLAVORS[idx];
    const item: CartItem = {
      id: this.cartSeq++,
      label: `${flav.name} Bar`,
      price: '$2.99',
      cents: 299,
    };

    if (pk) {
      this.flyToCart(pk, idx, 0, true, () => {
        this.cartItems.update((list) => [...list, item]);
      });
    } else {
      this.cartItems.update((list) => [...list, item]);
    }
  }

  // ==================== SECTION 4: 3-PACK BUILDER ====================

  protected addToPack(flavIdx: number): void {
    this.packTouched = true;
    const slots = [...this.packSlots()];
    const emptyIdx = slots.findIndex((s) => s === null);
    if (emptyIdx === -1) return;
    this.setPackSlot(emptyIdx, flavIdx, false);
  }

  protected removeFromPack(slotIdx: number): void {
    this.packTouched = true;
    const slots = [...this.packSlots()];
    if (slots[slotIdx] === null) return;
    slots[slotIdx] = null;
    this.packSlots.set(slots);
  }

  private setPackSlot(slotIdx: number, flavIdx: number, fromAuto: boolean): void {
    const slots = [...this.packSlots()];
    slots[slotIdx] = flavIdx;
    this.packSlots.set(slots);

    // Update glow colour & pulse
    this.glowColor.set(hexToRgba(FLAVORS[flavIdx].color, 0.72));
    if (!this.reducedMotion) {
      const glow = this.glowElRef().nativeElement;
      glow.animate([{ opacity: 0.55 }, { opacity: 1 }], {
        duration: 600,
        easing: 'ease-out',
      });
    }

    // Animate slot bar rising in
    if (!this.reducedMotion) {
      requestAnimationFrame(() => {
        const slotBar = this.findSlotBarEl(slotIdx);
        if (slotBar) {
          slotBar.animate(
            [
              { transform: `translateY(${this.vw < 820 ? -24 : -40 * (this.vw / 1440)}px) scale(0.8)`, opacity: 0 },
              { transform: 'translateY(0) scale(1)', opacity: 1 },
            ],
            { duration: fromAuto ? 550 : 550, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          );
        }
      });
    }
  }

  private findSlotBarEl(slotIdx: number): HTMLElement | null {
    const glow = this.glowElRef().nativeElement;
    const slotEls = glow.querySelectorAll('.slot');
    const slot = slotEls[slotIdx];
    return slot ? (slot.querySelector('.slot-bar') as HTMLElement | null) : null;
  }

  protected buyPack(): void {
    const slots = this.packSlots();
    if (slots.some((v) => v === null) || this.packAddedState()) return;
    this.packTouched = true;

    const names = slots.map((idx) => FLAVORS[idx as number].name).join(', ');
    const packItem: CartItem = {
      id: this.cartSeq++,
      label: `3-Pack (${names})`,
      price: '$7.48',
      cents: 748,
    };

    slots.forEach((flavIdx, sIdx) => {
      if (flavIdx === null) return;
      const barEl = this.findSlotBarEl(sIdx);
      const isLast = sIdx === slots.length - 1;
      if (barEl) {
        this.flyToCart(barEl, flavIdx, sIdx * 120, isLast, () => {
          this.cartItems.update((list) => [...list, packItem]);
        });
      } else if (isLast) {
        this.cartItems.update((list) => [...list, packItem]);
      }
    });

    window.setTimeout(() => {
      this.packSlots.set([null, null, null]);
      this.packAddedState.set(true);
      window.clearTimeout(this.buyResetTimer);
      this.buyResetTimer = window.setTimeout(() => {
        this.packAddedState.set(false);
      }, 1600);
    }, 60);
  }

  private flyToCart(
    srcEl: HTMLElement,
    flavIdx: number,
    delayMs: number,
    isLast: boolean,
    onDone: () => void,
  ): void {
    if (this.reducedMotion) {
      if (isLast) onDone();
      return;
    }

    const r = srcEl.getBoundingClientRect();
    const basket = this.basketBtnRef().nativeElement;
    const br = basket.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      if (isLast) onDone();
      return;
    }

    const clone = document.createElement('div');
    clone.className = 'spr';
    const sp = spriteStyle(FLAVORS[flavIdx].box, 4);
    clone.style.position = 'fixed';
    clone.style.left = `${r.left}px`;
    clone.style.top = `${r.top}px`;
    clone.style.width = `${r.width}px`;
    clone.style.height = `${r.height}px`;
    clone.style.backgroundSize = sp.backgroundSize;
    clone.style.backgroundPosition = sp.backgroundPosition;
    clone.style.zIndex = '70';
    clone.style.pointerEvents = 'none';
    clone.style.filter = 'drop-shadow(0 10px 14px rgba(0, 0, 0, 0.25))';
    clone.style.transformOrigin = 'center center';
    document.body.appendChild(clone);

    const dx = br.left + br.width / 2 - (r.left + r.width / 2);
    const dy = br.top + br.height / 2 - (r.top + r.height / 2);
    const lift = Math.min(160, 0.35 * Math.abs(dy) + 60);
    const k = Math.min(0.2, 30 / Math.max(1, r.height));

    const anim = clone.animate(
      [
        { transform: 'translate3d(0px, 0px, 0) scale(1) rotate(0deg)', opacity: 1 },
        {
          transform: `translate3d(${0.4 * dx}px, ${0.4 * dy - lift}px, 0) scale(${0.45 + k}) rotate(-10deg)`,
          opacity: 1,
          offset: 0.45,
        },
        { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${k}) rotate(-18deg)`, opacity: 0.15 },
      ],
      {
        duration: 900,
        delay: delayMs,
        easing: 'cubic-bezier(0.5, 0, 0.2, 1)',
        fill: 'forwards',
      },
    );

    anim.onfinish = () => {
      clone.remove();
      basket.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.45 }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'ease-out' },
      );

      if (isLast) {
        const hadItems = this.cartCount() > 0;
        onDone();
        requestAnimationFrame(() => {
          const badge = this.badgeElRef()?.nativeElement;
          if (badge) {
            badge.animate(
              [
                { transform: `scale(${hadItems ? 1 : 0})` },
                { transform: 'scale(1.5)', offset: 0.5 },
                { transform: 'scale(1)' },
              ],
              { duration: 350, easing: 'ease-out' },
            );
          }
        });
      }
    };
  }

  // ==================== NAV & CART ====================

  protected toggleCart(): void {
    this.cartOpen.update((v) => !v);
  }

  protected scrollToSection(e: Event, id: string): void {
    e.preventDefault();
    this.smoothScroll.active = false;
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({
        top: el.offsetTop,
        behavior: this.reducedMotion ? 'auto' : 'smooth',
      });
    }
  }

  private updateNavHighlight(): void {
    const links = this.navLinkEls();
    const idx = this.activeNavIndex();
    const activeEl = links[idx]?.nativeElement;
    const hl = this.navHlElRef().nativeElement;
    if (activeEl) {
      hl.style.left = `${activeEl.offsetLeft}px`;
      hl.style.width = `${activeEl.offsetWidth}px`;
    }
  }

  // ==================== PER-FRAME LOOP ====================

  private getHeroMetrics(): { u: number; cx: number; cy: number; xSpread: number; heroH: number } {
    const heroRect = this.flavorsElRef().nativeElement.getBoundingClientRect();
    const heroH = Math.max(300, heroRect.height || this.vh);
    const isPhone = this.vw < 820;
    const u = isPhone ? Math.min(this.vw / 560, heroH / 980) : Math.min(this.vw / 1440, this.vh / 900);
    const cx = this.vw / 2;
    const cy = isPhone ? 0.4 * heroH : heroH / 2 - 78 * u;
    const xSpread = isPhone ? 1.02 : 1;
    return { u, cx, cy, xSpread, heroH };
  }

  private evalArcState(k: number, barIndex: number, heroTop: number, now: number): BarState {
    const { u, cx, cy, xSpread } = this.getHeroMetrics();
    const sign = k >= 0 ? 1 : -1;
    const absK = Math.min(Math.abs(k), 4);
    const lo = Math.floor(absK);
    const hi = Math.min(4, lo + 1);
    const frac = absK - lo;

    const a = ARC_SLOTS[lo];
    const b = ARC_SLOTS[hi];
    const dx = sign * lerp(a.dx, b.dx, frac) * u * xSpread;
    const dy = lerp(a.dy, b.dy, frac) * u;
    const h = lerp(a.h, b.h, frac) * u;
    const rz = sign * lerp(a.rz, b.rz, frac);
    const ry = sign * lerp(a.ry, b.ry, frac);
    const z = -absK * 34 * u;
    const op = absK <= 3.3 ? 1 : clamp(1 - (absK - 3.3) / 0.6, 0, 1);

    let y = heroTop + cy + dy;
    let finalRz = rz;
    if (!this.reducedMotion) {
      const floatB = Math.sin((now / 4600) * Math.PI * 2 + 1.37 * barIndex);
      y -= (0.5 * floatB + 0.5) * 9 * u;
      finalRz += 0.4 * floatB;
    }

    return {
      x: cx + dx,
      y,
      h,
      rz: finalRz,
      ry,
      rx: 0,
      z,
      op,
      sx: 1,
      sy: 1,
      shadow: 1,
    };
  }

  private lerpBarState(a: BarState, b: BarState, t: number): BarState {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      h: lerp(a.h, b.h, t),
      rz: lerp(a.rz, b.rz, t),
      ry: lerp(a.ry, b.ry, t),
      rx: lerp(a.rx, b.rx, t),
      z: lerp(a.z, b.z, t),
      op: lerp(a.op, b.op, t),
      sx: lerp(a.sx, b.sx, t),
      sy: lerp(a.sy, b.sy, t),
      shadow: lerp(a.shadow, b.shadow, t),
    };
  }

  private onFrame(now: number, dt: number): void {
    // 1. Smooth scroll
    if (this.smoothScroll.active) {
      const k = 1 - Math.exp(-dt / 120);
      this.smoothScroll.curr += (this.smoothScroll.target - this.smoothScroll.curr) * k;
      if (Math.abs(this.smoothScroll.target - this.smoothScroll.curr) < 0.5) {
        window.scrollTo(0, this.smoothScroll.target);
        this.smoothScroll.active = false;
      } else {
        window.scrollTo(0, this.smoothScroll.curr);
      }
    }

    // 2. Autoplay
    if (
      this.heroEntered &&
      this.autoplay() &&
      !this.reducedMotion &&
      !this.dragState.dragging &&
      !this.slideTween.active &&
      this.heroInViewRatio >= 0.6 &&
      document.visibilityState === 'visible' &&
      now - this.lastInteractionTime >= 3200
    ) {
      this.lastInteractionTime = now;
      this.goTo(this.target + 1);
    }

    // 3. Slide tween
    if (this.slideTween.active) {
      const t = clamp((now - this.slideTween.start) / this.slideTween.dur, 0, 1);
      this.pos = lerp(this.slideTween.from, this.slideTween.to, this.slideTween.easeFn(t));
      if (!this.slideTween.swapped && t >= 0.12) {
        this.slideTween.swapped = true;
        if (this.slideTween.newFlav !== this.activeFlavor()) {
          this.triggerFlavourChange(this.slideTween.newFlav, this.slideTween.dir, false);
        }
      }
      if (t >= 1) {
        this.pos = this.slideTween.to;
        this.slideTween.active = false;
      }
    }

    // 4. Feathered circular colour reveal
    if (this.revealState.active) {
      const t = clamp((now - this.revealState.start) / this.revealState.dur, 0, 1);
      const { cx, cy, heroH } = this.getHeroMetrics();
      const R =
        1.45 *
        Math.max(
          Math.hypot(cx, cy),
          Math.hypot(this.vw - cx, cy),
          Math.hypot(cx, heroH - cy),
          Math.hypot(this.vw - cx, heroH - cy),
        );
      const r = R * GLIDE_EASE(t);
      const f = Math.max(60, 0.35 * r);
      const mask = `radial-gradient(circle at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, #000 ${Math.max(0, r - f).toFixed(1)}px, transparent ${r.toFixed(1)}px)`;
      const revealEl = this.revealElRef().nativeElement;
      revealEl.style.maskImage = mask;
      revealEl.style.webkitMaskImage = mask;

      if (t >= 1) {
        this.revealState.active = false;
        document.documentElement.style.setProperty('--flav', this.revealState.color);
        document.documentElement.style.setProperty('--rv', 'transparent');
        revealEl.style.maskImage = '';
        revealEl.style.webkitMaskImage = '';
      }
    }

    // 5. Measure section bounds
    const heroRect = this.flavorsElRef().nativeElement.getBoundingClientRect();
    const insideRect = this.insideElRef().nativeElement.getBoundingClientRect();
    const shopRect = this.shopElRef().nativeElement.getBoundingClientRect();
    const rangeRect = this.rangeElRef().nativeElement.getBoundingClientRect();

    // Update nav active link & tone
    const rects = [heroRect, insideRect, shopRect, rangeRect];
    let navIdx = 0;
    const thresh = this.vh * 0.35;
    for (let i = 0; i < rects.length; i++) {
      if (rects[i].top <= thresh) navIdx = i;
    }
    if (navIdx !== this.activeNavIndex()) {
      this.activeNavIndex.set(navIdx);
      this.updateNavHighlight();
    }

    const navTrigger = 45;
    if (rangeRect.top <= navTrigger) {
      if (this.navTone() !== 'dark') this.navTone.set('dark');
    } else if (shopRect.top <= navTrigger) {
      if (this.navTone() !== 'light') this.navTone.set('light');
    } else {
      if (this.navTone() !== 'default') this.navTone.set('default');
    }

    // 6. Section 2 scaling, pin emulation, scroll mapping & storm
    const isPhone = this.vw < 820;
    const frameScale = isPhone
      ? Math.min(this.vw / 390, this.vh / 780)
      : Math.min(this.vw / 1440, this.vh / 900);
    const frameTransform = `translate(-50%, -50%) scale(${frameScale.toFixed(5)})`;
    this.inBackFrameRef().nativeElement.style.transform = frameTransform;
    this.inFrontFrameRef().nativeElement.style.transform = frameTransform;

    const inFront = this.inFrontElRef().nativeElement;
    const insideVisible = insideRect.bottom > 0 && insideRect.top < this.vh;
    if (insideVisible) {
      inFront.classList.add('visible');
      const pinY =
        insideRect.top > 0
          ? insideRect.top
          : insideRect.bottom < this.vh
            ? insideRect.bottom - this.vh
            : 0;
      inFront.style.transform = `translate3d(0, ${pinY.toFixed(2)}px, 0)`;
    } else {
      inFront.classList.remove('visible');
    }

    const insideScrollSpan = Math.max(1, insideRect.height - this.vh);
    const p = clamp(-insideRect.top / insideScrollSpan, 0, 1);
    const step = Math.floor(Math.min(p, 0.759) / 0.19);
    if (step !== this.currentInsideStep) {
      this.triggerInsideStep(step);
    }

    if (this.flipTween.active) {
      const ft = clamp((now - this.flipTween.start) / this.flipTween.dur, 0, 1);
      this.flipRy = lerp(this.flipTween.from, this.flipTween.to, sineEaseInOut(ft));
      if (ft >= 1) {
        this.flipRy = this.flipTween.to;
        this.flipTween.active = false;
      }
    }

    const q = clamp((p - 0.76) / 0.24, 0, 1);
    const frontFade = String(1 - clamp(4 * q, 0, 1));
    this.inFrontFrameRef().nativeElement.style.opacity = frontFade;
    this.inNumElRef().nativeElement.style.opacity = frontFade;
    this.inDarkElRef().nativeElement.style.opacity = String(clamp(3.5 * q, 0, 1) * 0.42);

    // Storm pieces
    const stormEls = this.stormEls();
    if (q <= 0 || q >= 1 || this.reducedMotion) {
      for (const ref of stormEls) {
        ref.nativeElement.style.opacity = '0';
      }
    } else {
      const R = 0.55 * Math.hypot(this.vw, this.vh);
      const qFade = clamp(5 * q, 0, 1) * clamp(6 * (1 - q), 0, 1);
      const cx = this.vw / 2;
      const cy = this.vh / 2;
      for (let i = 0; i < stormEls.length; i++) {
        const sp = this.stormPieces[i];
        const el = stormEls[i].nativeElement;
        const s = clamp((q - 0.45 * sp.ph) / 0.55, 0, 1);
        if (s <= 0 || s >= 1) {
          el.style.opacity = '0';
          continue;
        }
        const radius = (0.06 + Math.pow(s, 1.5) * 0.95) * R;
        const px = cx + Math.cos(sp.angle) * radius;
        const py = cy + Math.sin(sp.angle) * radius * 0.8;
        const sc = 0.2 + 1.7 * s;
        const rot = sp.spin * s;
        const op = Math.sin(Math.PI * s) * qFade;
        el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%) scale(${sc.toFixed(3)}) rotate(${rot.toFixed(1)}deg)`;
        el.style.opacity = op.toFixed(3);
      }
    }

    // 7. 3D Pool & Traveller
    const p1 = clamp(1 - insideRect.top / Math.max(1, this.vh), 0, 1);
    const p3 = clamp((this.vh - shopRect.top) / Math.max(1, 0.7 * this.vh), 0, 1);

    if (isPhone && p3 > 0 && !this.phoneAutoCentered) {
      this.phoneAutoCentered = true;
      const cardsEl = this.cardsElRef().nativeElement;
      const liveCard = this.cardEls()[this.activeFlavor()]?.nativeElement;
      if (liveCard) {
        const left = Math.max(0, liveCard.offsetLeft - (cardsEl.clientWidth - liveCard.offsetWidth) / 2);
        cardsEl.scrollTo({ left, behavior: this.reducedMotion ? 'auto' : 'smooth' });
      }
    } else if (p3 <= 0) {
      this.phoneAutoCentered = false;
    }

    const jT = Math.round(this.target);
    const jCenter = Math.floor(this.pos);
    const poolFade = 1 - clamp(1.6 * p1, 0, 1);

    if (this.glScene) {
      for (let slot = 0; slot < 11; slot++) {
        const j = jCenter - 5 + slot;
        if (j === jT || poolFade <= 0.01) {
          this.glScene.hidePoolBar(slot);
          continue;
        }
        const state = this.evalArcState(j - this.pos, j, heroRect.top, now);
        state.op *= poolFade;
        this.glScene.updatePoolBar(slot, modFlavour(j), j, state);
      }

      // Anchor A (hero)
      const stateA = this.evalArcState(jT - this.pos, jT, heroRect.top, now);

      // Anchor B (section 2)
      const inBarRect = this.inBarElRef().nativeElement.getBoundingClientRect();
      const stormSpin = this.reducedMotion ? 0 : 720 * q;
      const bobY = this.reducedMotion ? 0 : Math.sin((now / 2600) * Math.PI * 2) * 6;
      const bRy = this.flipRy + stormSpin;
      const stateB: BarState = {
        x: inBarRect.left + inBarRect.width / 2,
        y: inBarRect.top + inBarRect.height / 2 + bobY,
        h: inBarRect.height,
        rz: 14,
        ry: bRy,
        rx: 0,
        z: 0,
        op: 1,
        sx: 1,
        sy: 1,
        shadow: 1,
      };

      // Anchor C (live card .pk)
      const activeFlav = this.activeFlavor();
      const livePk = this.pkEls()[activeFlav]?.nativeElement;
      const pkRect = livePk ? livePk.getBoundingClientRect() : inBarRect;
      const nearestTurn = Math.round(bRy / 360) * 360;
      const stateC: BarState = {
        x: pkRect.left + pkRect.width / 2,
        y: pkRect.top + pkRect.height / 2,
        h: pkRect.height,
        rz: 0,
        ry: nearestTurn + this.liveCardTiltX * 14,
        rx: -this.liveCardTiltY * 14,
        z: 30,
        op: 1,
        sx: 1,
        sy: 1,
        shadow: 0.7,
      };

      let travState = stateA;
      if (p1 > 0) {
        travState = this.lerpBarState(travState, stateB, sineEaseInOut(p1));
      }
      if (p3 > 0) {
        travState = this.lerpBarState(travState, stateC, sineEaseInOut(p3));
      }

      // Apply squash poke on live card
      if (this.pokeStart >= 0) {
        const pt = (now - this.pokeStart) / 500;
        if (pt >= 1) {
          this.pokeStart = -1;
        } else {
          let sx = 1;
          let sy = 1;
          if (pt < 0.3) {
            const k = pt / 0.3;
            sx = lerp(1, 1.06, k);
            sy = lerp(1, 0.93, k);
          } else if (pt < 0.6) {
            const k = (pt - 0.3) / 0.3;
            sx = lerp(1.06, 0.97, k);
            sy = lerp(0.93, 1.04, k);
          } else {
            const k = (pt - 0.6) / 0.4;
            sx = lerp(0.97, 1, k);
            sy = lerp(1.04, 1, k);
          }
          travState.sx *= sx;
          travState.sy *= sy;
        }
      }

      this.glScene.updateTraveller(modFlavour(jT), jT, travState);
      this.glScene.render();
    }
  }

  private cleanup(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    for (const id of this.introTimers) window.clearTimeout(id);
    for (const id of this.packAutoTimers) window.clearTimeout(id);
    window.clearTimeout(this.stepTextTimer1);
    window.clearTimeout(this.stepTextTimer2);
    window.clearTimeout(this.buyResetTimer);
    for (const obs of this.observers) obs.disconnect();
    for (const fn of this.cleanupFns) fn();
    this.glScene?.dispose();
    document.body.classList.remove('locked', 'dragging', 'gl');
  }
}
