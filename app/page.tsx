import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen pb-36 px-4 overflow-y-auto bg-[#131315] text-[#e5e1e4] flex flex-col items-center justify-center py-16 gap-10 antialiased font-[Inter,sans-serif]">
      {/* Hero */}
      <div className="text-center max-w-xl">
        <div className="text-6xl mb-4">📡</div>
        <h1 className="text-5xl font-bold text-[#4cd7f6] tracking-tighter uppercase leading-tight">
          BEAM-NET
        </h1>
        <p className="mt-4 text-[#869397] font-mono text-sm leading-relaxed">
          Ultra-secure file transfer using <span className="text-[#4edea3] font-semibold">Air-Gapped Optical QR Streams</span> and <span className="text-[#4cd7f6] font-semibold">Private Vercel Cloud Storage</span>.
        </p>
      </div>

      {/* Cards */}
      <div className="flex flex-col sm:flex-row gap-6 w-full max-w-lg">
        <Link
          href="/send"
          className="flex-1 group relative rounded-none p-6 bg-[#0e0e10] border border-[#4cd7f6]/40 hover:border-[#4cd7f6] transition-all duration-300 shadow-lg overflow-hidden"
        >
          <div className="relative text-center flex flex-col items-center gap-3">
            <span className="text-4xl">📤</span>
            <h2 className="text-xl font-bold text-[#4cd7f6] font-mono uppercase tracking-wider">Broadcaster</h2>
            <p className="text-[#869397] text-xs font-mono">
              Upload, compress, and stream payloads as sequential QR streams or instant Vercel Blob URLs.
            </p>
            <span className="mt-2 inline-block px-4 py-1.5 bg-[#4cd7f6]/10 text-[#4cd7f6] text-xs font-mono uppercase tracking-widest border border-[#4cd7f6]/40">
              Open Sender →
            </span>
          </div>
        </Link>

        <Link
          href="/scan"
          className="flex-1 group relative rounded-none p-6 bg-[#0e0e10] border border-[#4edea3]/40 hover:border-[#4edea3] transition-all duration-300 shadow-lg overflow-hidden"
        >
          <div className="relative text-center flex flex-col items-center gap-3">
            <span className="text-4xl">📷</span>
            <h2 className="text-xl font-bold text-[#4edea3] font-mono uppercase tracking-wider">Collector</h2>
            <p className="text-[#869397] text-xs font-mono">
              Scan optical QR streams or type a 6-digit passkey to reassemble payloads on camera-less devices.
            </p>
            <span className="mt-2 inline-block px-4 py-1.5 bg-[#4edea3]/10 text-[#4edea3] text-xs font-mono uppercase tracking-widest border border-[#4edea3]/40">
              Open Receiver →
            </span>
          </div>
        </Link>
      </div>

      {/* How it works */}
      <div className="w-full max-w-lg bg-[#0e0e10] border border-[#3d494c] rounded-none p-6 font-mono">
        <h3 className="text-[#bcc9cd] font-semibold mb-3 text-xs uppercase tracking-widest">Protocol Matrix</h3>
        <ol className="text-[#869397] text-xs space-y-2 list-decimal list-inside">
          <li>Files ≤ 100 KB present a protocol choice (Optical Stream vs Vercel Cloud Blob).</li>
          <li>Files &gt; 100 KB auto-upload to Private Vercel Blob store (`store_Uuhi1JVtHqWZuScC`).</li>
          <li>Generates a zero-click auto-download QR code + 15-minute 6-digit transfer passkey.</li>
          <li>Receiver scans QR or types passkey to download payload instantly onto target PC.</li>
        </ol>
      </div>

      {/* Made with ❤️ Footer */}
      <footer className="mt-12 mb-8 py-6 text-center border-t border-[#3d494c]/60 w-full max-w-lg">
        <p className="text-xs font-mono text-[#869397] flex items-center justify-center gap-1">
          Made with <span className="text-red-500">❤️</span> • Free & Open Source Air-Gapped Tool
        </p>
        <p className="text-[10px] font-mono text-[#3d494c] mt-1">
          BEAM-NET v1.0 • Hybrid Optical Transfer
        </p>
      </footer>
    </main>
  );
}
