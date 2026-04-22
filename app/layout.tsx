import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SidebarProvider } from '@/components/providers/sidebar-provider'
import './globals.css'

const geist = Geist({ 
  subsets: ["latin"],
  variable: '--font-geist-sans'
})

const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: '--font-geist-mono'
})

export const metadata: Metadata = {
  title: 'SpiderNET - Advanced Threat Detection',
  description: 'Advanced Security Monitoring Platform for Social Engineering Detection',
  generator: 'v0.app',
}

// Inline script: strip attributes that browser extensions (Bitwarden,
// Grammarly, LastPass, etc.) inject into the DOM before React hydrates.
// Must run BEFORE React's hydration walk — so we inject it in <head>
// with dangerouslySetInnerHTML, before anything else in <body>.
const stripExtensionAttrs = `
(function(){
  var attrs = ['bis_skin_checked','bis_register','data-gr-c-s-check-loaded','data-new-gr-c-s-check-loaded','data-gr-ext-installed','data-gr-ext-disabled','data-lt-installed','cz-shortcut-listen'];
  function clean(root){
    if(!root) return;
    for(var i=0;i<attrs.length;i++){
      if(root.hasAttribute && root.hasAttribute(attrs[i])) root.removeAttribute(attrs[i]);
    }
    if(root.querySelectorAll){
      var sel = attrs.map(function(a){return '['+a+']'}).join(',');
      var nodes = root.querySelectorAll(sel);
      for(var j=0;j<nodes.length;j++){
        for(var k=0;k<attrs.length;k++){
          nodes[j].removeAttribute(attrs[k]);
        }
      }
    }
  }
  // Initial sweep as soon as DOM is available
  if(document.documentElement) clean(document.documentElement);
  // Keep cleaning as the extensions re-inject
  try {
    var mo = new MutationObserver(function(muts){
      for(var i=0;i<muts.length;i++){
        var m = muts[i];
        if(m.type === 'attributes' && m.target && attrs.indexOf(m.attributeName) !== -1){
          m.target.removeAttribute(m.attributeName);
        } else if(m.type === 'childList'){
          for(var n=0;n<m.addedNodes.length;n++){
            clean(m.addedNodes[n]);
          }
        }
      }
    });
    mo.observe(document.documentElement, { attributes: true, subtree: true, childList: true, attributeFilter: attrs });
    // Stop observing after 10s — extensions have long since settled,
    // and React is done hydrating.
    setTimeout(function(){ mo.disconnect(); }, 10000);
  } catch(e) {}
})();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-[#0F172A]" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: stripExtensionAttrs }} suppressHydrationWarning />
      </head>
      <body
        suppressHydrationWarning
        className={`${geist.variable} ${geistMono.variable} font-sans antialiased bg-[#0F172A] text-slate-200`}
      >
        <SidebarProvider>
          {children}
        </SidebarProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
