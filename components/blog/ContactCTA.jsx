import Link from "next/link";

export default function ContactCTA() {
  return (
    <section
      aria-label="Get in touch"
      className="my-12 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900"
    >
      <div className="px-7 py-10 sm:px-10 sm:py-12 flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-8">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200 mb-1">
            Shark Web Digital
          </p>
          <h2 className="text-xl sm:text-2xl font-black text-white leading-tight mb-2">
            Ready to grow your business online?
          </h2>
          <p className="text-blue-100 text-sm leading-relaxed max-w-lg">
            Get expert digital marketing, SEO, and web design services tailored to your business goals.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full sm:w-auto">
          <Link
            href="/#contact"
            className="inline-flex items-center justify-center gap-2 bg-white text-blue-900 font-bold text-sm px-6 py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
          >
            Free Consultation
          </Link>
          <Link
            href="mailto:hello@sharkwebdigital.com"
            className="inline-flex items-center justify-center gap-2 border border-white/30 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-white/10 transition-all duration-200"
          >
            Email Us
          </Link>
        </div>
      </div>
    </section>
  );
}
