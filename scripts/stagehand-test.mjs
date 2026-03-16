import { Stagehand } from '@browserbasehq/stagehand'
import { LangchainClient } from '@browserbasehq/stagehand'
import { ChatOpenAI } from '@langchain/openai'

export const getStagehand = async () => {
  const stagehand = new Stagehand({
    env: 'LOCAL',
    llmClient: new LangchainClient(
      new ChatOpenAI({
        model: 'gpt-5.4',
        useResponsesApi: true,
        configuration: {
          baseUrl: 'https://gmn.chuangzuoli.com/',
          apiKey: 'sk-d0330d00a47ba09ace4c512a18910f45fc13569a2ced4b60b1f10f990e775707'
        }
      })
    ),
    localBrowserLaunchOptions: {
      headless: false, // Show browser window
      // devtools: true, // Open developer tools
      viewport: { width: 1280, height: 720 },
      executablePath: '/opt/google/chrome/chrome', // Custom Chrome path
      port: 10531, // Fixed CDP debugging port
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--allow-running-insecure-content'
      ],
      userDataDir: './chrome-user-data', // Persist browser data
      preserveUserDataDir: true, // Keep data after closing
      chromiumSandbox: false, // Disable sandbox (adds --no-sandbox)
      ignoreHTTPSErrors: true, // Ignore certificate errors
      locale: 'en-US', // Set browser language
      deviceScaleFactor: 1.0, // Display scaling
      downloadsPath: './downloads', // Download directory
      acceptDownloads: true, // Allow downloads
      connectTimeoutMs: 30000 // Connection timeout
    }
  })

  await stagehand.init()

  const result = await stagehand.act("Go to google.com and search for 'how to make a website'")

  console.log(result)
}

getStagehand()
