import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-slate-900 text-white flex flex-col items-center justify-center px-6 py-16 gap-10">
      {/* Hero */}
      <div className="text-center max-w-xl">
        <div className="text-6xl mb-4">📡</div>
        <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-cyan-300 to-violet-400 leading-tight">
          AirQR
        </h1>
        <p className="mt-4 text-gray-400 text-lg leading-relaxed">
          Transfer files between devices <span className="text-white font-semibold">completely offline</span> using
          sequential QR codes. No Wi‑Fi, Bluetooth, or internet required.
        </p>
      </div>

      {/* Cards */}
      <div className="flex flex-col sm:flex-row gap-6 w-full max-w-lg">
        <Link
          href="/send"
          className="flex-1 group relative rounded-2xl p-6 bg-gray-900/60 border border-teal-700/40 hover:border-teal-500/70 transition-all duration-300 shadow-lg hover:shadow-teal-900/40 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-teal-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
          <div className="relative text-center flex flex-col items-center gap-3">
            <span className="text-4xl">📤</span>
            <h2 className="text-xl font-bold text-teal-300">Send a File</h2>
            <p className="text-gray-400 text-sm">
              Upload, compress, and stream a file as QR codes for the receiver to scan.
            </p>
            <span className="mt-2 inline-block px-4 py-1.5 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold border border-teal-600/40">
              Go to Sender →
            </span>
          </div>
        </Link>

        <Link
          href="/scan"
          className="flex-1 group relative rounded-2xl p-6 bg-gray-900/60 border border-violet-700/40 hover:border-violet-500/70 transition-all duration-300 shadow-lg hover:shadow-violet-900/40 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
          <div className="relative text-center flex flex-col items-center gap-3">
            <span className="text-4xl">📷</span>
            <h2 className="text-xl font-bold text-violet-300">Receive a File</h2>
            <p className="text-gray-400 text-sm">
              Point your camera at the QR stream. Chunks are captured and reassembled automatically.
            </p>
            <span className="mt-2 inline-block px-4 py-1.5 rounded-full bg-violet-500/20 text-violet-300 text-xs font-semibold border border-violet-600/40">
              Go to Receiver →
            </span>
          </div>
        </Link>
      </div>

      {/* How it works */}
      <div className="w-full max-w-lg bg-gray-900/50 border border-gray-700/40 rounded-2xl p-6">
        <h3 className="text-gray-300 font-semibold mb-3 text-sm uppercase tracking-widest">How it works</h3>
        <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
          <li>Sender compresses the file and splits it into small QR-coded chunks.</li>
          <li>QR codes loop continuously on screen at your chosen FPS.</li>
          <li>Receiver camera scans each QR, tracks unique chunks, and shows progress.</li>
          <li>Once all chunks arrive, the file is reassembled and available to download.</li>
        </ol>
      </div>

      <p className="text-gray-600 text-xs">All processing is 100% client-side — nothing leaves your device.</p>
    </main>
  );
}
