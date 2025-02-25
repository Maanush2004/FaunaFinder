import './globals.css'

export const metadata = {
    title: 'FaunaFinder',
    description: 'A tool to find out about any animal',
  }
   
  export default function RootLayout({ children }) {
    return (
      <html lang="en">
        <body>
          <div id="root" style={{ margin: 0, padding: 0 }}>{children}</div>
        </body>
      </html>
    )
  }