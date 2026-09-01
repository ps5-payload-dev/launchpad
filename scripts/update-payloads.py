#!/usr/bin/env python3
'''Refresh the generated fields in docs/payloads.json.

Manually maintained fields (displayname, description, sourcecode, args, ...)
are left untouched. Only "releases" and "contributors" are (re)generated from
the GitHub API, using the repository named by "sourcecode".

Without credentials the GitHub API allows 60 requests per hour, which is easily
exhausted on a shared IP address. Set GITHUB_TOKEN (or GH_TOKEN) to lift that
limit; in GitHub Actions, ${{ secrets.GITHUB_TOKEN }} is enough.
'''

import argparse
import json
import os
import posixpath
import sys
import urllib.error
import urllib.parse
import urllib.request


GITHUB_API = 'https://api.github.com'
USER_AGENT = 'launchpad/1.0'


class Error(Exception):
    pass


def api_get(path, **params):
    '''Perform a GET request against the GitHub REST API.'''
    url = GITHUB_API + path
    if params:
        url += '?' + urllib.parse.urlencode(params)

    headers = {'Accept': 'application/vnd.github+json',
               'X-GitHub-Api-Version': '2022-11-28',
               'User-Agent': USER_AGENT}

    token = os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')
    if token:
        headers['Authorization'] = 'Bearer ' + token

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        if e.code == 403 and e.headers.get('x-ratelimit-remaining') == '0':
            raise Error('%s: rate limit exceeded, set GITHUB_TOKEN' % url)
        raise Error('%s: HTTP %d %s' % (url, e.code, e.reason))
    except urllib.error.URLError as e:
        raise Error('%s: %s' % (url, e.reason))


def parse_repo(url):
    '''Split a github.com project URL into an (owner, repo) tuple.'''
    parts = urllib.parse.urlparse(url)
    if parts.netloc not in ('github.com', 'www.github.com'):
        raise Error('%s: not a github.com URL' % url)

    path = parts.path.strip('/')
    if path.endswith('.git'):
        path = path[:-len('.git')]

    try:
        owner, repo = path.split('/')
    except ValueError:
        raise Error('%s: not a github.com project URL' % url)

    return owner, repo


def asset_name(payload):
    '''Figure out which release asset belongs to the given payload.'''
    if payload.get('asset'):
        return payload['asset']

    for url in payload.get('releases', {}).values():
        name = posixpath.basename(urllib.parse.urlparse(url).path)
        if name:
            return name

    raise Error('%s: unable to determine asset name, add an "asset" field'
                % payload.get('displayname', '<unnamed>'))


def fetch_releases(owner, repo, asset, max_releases):
    '''Build a release tag -> asset URL mapping for the given repository.'''
    releases = {}
    base = 'https://github.com/%s/%s/releases' % (owner, repo)

    for rel in api_get('/repos/%s/%s/releases' % (owner, repo), per_page=100):
        if rel.get('draft') or rel.get('prerelease'):
            continue

        if not any(a['name'] == asset for a in rel.get('assets', [])):
            continue

        if not releases:
            releases['latest'] = '%s/latest/download/%s' % (base, asset)

        tag = rel['tag_name']
        releases[tag] = '%s/download/%s/%s' % (base, urllib.parse.quote(tag),
                                               asset)
        if len(releases) > max_releases:
            break

    if not releases:
        raise Error('%s/%s: no published release provides "%s"'
                    % (owner, repo, asset))

    return releases


def fetch_contributors(owner, repo):
    '''List the login names of human contributors, most commits first.'''
    logins = []
    page = 1

    while True:
        chunk = api_get('/repos/%s/%s/contributors' % (owner, repo),
                        per_page=100, page=page)
        if not chunk:
            break

        for user in chunk:
            login = user.get('login')
            if not login or user.get('type') == 'Bot':
                continue
            if login.endswith('[bot]'):
                continue
            logins.append(login)

        if len(chunk) < 100:
            break
        page += 1

    if not logins:
        raise Error('%s/%s: no contributors reported' % (owner, repo))

    return logins


def dumps(payloads):
    '''Serialize payloads the way docs/payloads.json is hand-written.'''
    def enc(obj):
        return json.dumps(obj, ensure_ascii=False)

    entries = []
    for payload in payloads:
        lines = []
        for key, val in payload.items():
            if isinstance(val, dict):
                items = ',\n'.join('\t    %s: %s' % (enc(k), enc(v))
                                   for k, v in val.items())
                lines.append('\t%s: {\n%s\n\t}' % (enc(key), items))
            elif isinstance(val, list):
                items = ', '.join(enc(v) for v in val)
                lines.append('\t%s: [%s]' % (enc(key), items))
            else:
                lines.append('\t%s: %s' % (enc(key), enc(val)))
        entries.append('    {\n%s\n    }' % ',\n'.join(lines))

    return '[\n%s\n]\n' % ',\n'.join(entries)


def update(payload, max_releases, contributors=True):
    '''Refresh the generated fields of a single payload, in place.'''
    owner, repo = parse_repo(payload['sourcecode'])
    errors = []

    try:
        payload['releases'] = fetch_releases(owner, repo, asset_name(payload),
                                             max_releases)
    except Error as e:
        errors.append(e)

    if contributors:
        try:
            payload['contributors'] = fetch_contributors(owner, repo)
        except Error as e:
            errors.append(e)

    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', nargs='?', default='docs/payloads.json',
                        help='payload catalogue to update (default: %(default)s)')
    parser.add_argument('-n', '--max-releases', type=int, default=3,
                        metavar='N', help='number of release tags to keep, '
                        'excluding "latest" (default: %(default)s)')
    parser.add_argument('-C', '--no-contributors', action='store_true',
                        help='leave the contributor lists alone')
    parser.add_argument('--check', action='store_true',
                        help='do not write, exit 1 if the file is outdated')
    parser.add_argument('--strict', action='store_true',
                        help='exit non-zero if any metadata could not be fetched')
    args = parser.parse_args()

    with open(args.path, 'r', encoding='utf-8') as f:
        before = f.read()
    payloads = json.loads(before)

    errors = []
    for payload in payloads:
        errors += update(payload, args.max_releases, not args.no_contributors)

    for e in errors:
        print('warning: %s' % e, file=sys.stderr)

    after = dumps(payloads)
    if after == before:
        print('%s is up to date' % args.path)
        return 1 if errors and args.strict else 0

    if args.check:
        print('%s is outdated' % args.path, file=sys.stderr)
        return 1

    with open(args.path, 'w', encoding='utf-8') as f:
        f.write(after)

    print('%s updated' % args.path)
    return 1 if errors and args.strict else 0


if __name__ == '__main__':
    sys.exit(main())
