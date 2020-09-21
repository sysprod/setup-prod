import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as io from '@actions/io'
import {Octokit} from '@octokit/rest'
import path from 'path'
import os from 'os'

const app = 'prod'

/*
  Debug mode: in github, set the secret `ACTIONS_RUNNER_DEBUG` to true

  Dev mode:
    1. export RUNNER_TEMP="$(mktemp -d)"
    2. ts-node src/main.ts

    Setting inputs:
    - export INPUT_VERSION
    - export INPUT_BASE_URL

  Note:
  - list all platform/arch: go tool dist list
*/
async function run(): Promise<void> {
  try {
    core.debug(new Date().toTimeString())

    const base_url: string =
      core.getInput('base_url') ||
      'https://github.com/sysprod/prod/releases/download/'

    let version: string = core.getInput('version')
    if (version === 'latest' || version === '') {
      version = await latestVersion('sysprod', app)
    }

    const base = new URL(base_url)
    const platform: string = os.platform()
    const arch: string = golangArch(os.arch())

    core.debug(`platform: ${platform}, arch: ${arch}, version: ${version}`)

    const url = constructURL(base, app, platform, arch, version)
    core.debug(`download url: ${url.toString()}`)

    const src = await tc.downloadTool(url.toString())
    core.debug(`download path: ${src}`)

    const dir = path.dirname(src)

    let dest: string
    switch (platform) {
      case 'win32':
        dest = path.join(dir, `${app}.exe`)
        break
      default:
        dest = path.join(dir, app)
    }

    core.debug(`moving ${src} to ${dest}`)
    io.mv(src, dest)
    core.addPath(dest)

    core.debug(new Date().toTimeString())
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function latestVersion(owner: string, repo: string): Promise<string> {
  const client = new Octokit()
  const {data: release} = await client.repos.getLatestRelease({
    owner,
    repo,
    type: 'public'
  })
  return release.tag_name
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
  const filepath = path.join(version, bin.join('_'))
  core.debug(`filepath: ${filepath}`)
  return new URL(filepath, base)
}

run()
