import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as exec from '@actions/exec'
import {Octokit} from '@octokit/rest'
import {createActionAuth} from '@octokit/auth-action'
import path from 'path'
import os from 'os'

const app = 'prod'

/*
  Debug mode: in github, set the secret `ACTIONS_RUNNER_DEBUG` to true

  Dev mode:
    1. export RUNNER_TEMP="$(mktemp -d)"
    2. export RUNNER_TOOL_CACHE="$(mktemp -d)"
    3. ts-node src/main.ts

    Setting inputs:
    - (optional) export INPUT_VERSION
    - (optional) export INPUT_BASE_URL
    - (optional) export INPUT_TOKEN
    - (optional) GITHUB_ACTION

  Note:
  - list all platform/arch: go tool dist list
*/
async function run(): Promise<void> {
  try {
    core.debug(new Date().toTimeString())

    const token: string = await getToken(core.getInput('GITHUB_TOKEN'))

    const base_url: string =
      core.getInput('base_url') ||
      'https://github.com/sysprod/prod/releases/download/'

    let version: string = core.getInput('version')
    if (version === 'latest' || version === '') {
      version = await latestVersion('sysprod', app, token)
    }

    const base = new URL(base_url)
    const platform: string = golangPlatform(os.platform())
    const arch: string = golangArch(os.arch())

    core.info(`platform: ${platform}, arch: ${arch}, version: ${version}`)

    let src: string = tc.find(app, version)
    if (!src) {
      src = await install(base, app, platform, arch, version, token)
    }
    core.info(`Cached ${src}`)

    const dir = path.dirname(src)
    core.debug(`adding ${dir} to PATH`)
    core.addPath(dir)

    core.debug(new Date().toTimeString())
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function getToken(githubToken: string): Promise<string> {
  if (!githubToken) {
    return ''
  }
  const auth = createActionAuth()
  const {token} = await auth()
  return token
}

async function install(
  base: URL,
  name: string,
  platform: string,
  arch: string,
  version: string,
  token: string
): Promise<string> {
  const url = constructURL(base, name, platform, arch, version)

  let auth = ''
  if (token) {
    auth = `Bearer ${token}`
  }

  const src: string = await tc.downloadTool(url.toString(), undefined, auth)

  let bin: string
  switch (platform) {
    case 'windows':
      bin = `${app}.exe`
      break
    default:
      await exec.exec(`chmod u+x ${src}`)
      bin = app
  }

  const cachedir: string = await tc.cacheFile(src, bin, app, version)
  return path.join(cachedir, bin)
}

async function latestVersion(
  owner: string,
  repo: string,
  token: string
): Promise<string> {
  let auth = ''
  if (token) {
    auth = `Bearer ${token}`
  }

  const client = new Octokit({auth})
  const {data: release} = await client.repos.getLatestRelease({
    owner,
    repo,
    type: 'public'
  })
  return release.tag_name
}

function golangPlatform(platform: string): string {
  const mappings: {[index: string]: string} = {
    win32: 'windows'
  }
  return mappings[platform] || platform
}

function golangArch(arch: string): string {
  const mappings: {[index: string]: string} = {
    x32: '386',
    x64: 'amd64'
  }
  return mappings[arch] || arch
}

// constructURL returns the url to download prod
function constructURL(
  base: URL,
  name: string,
  platform: string,
  arch: string,
  version: string
): URL {
  const bin = [name, platform, arch]
  let filepath = path.join(version, bin.join('_'))
  if (platform === 'windows') {
    filepath = `${filepath}.exe`
  }
  core.debug(`filepath: ${filepath}`)
  return new URL(filepath, base)
}

run()
