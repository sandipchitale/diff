[![CI and release](https://github.com/sandipchitale/diff/actions/workflows/ci.yml/badge.svg)](https://github.com/sandipchitale/diff/actions/workflows/ci.yml)

# Helm plugin - diff-releases

This ```helm``` plugin supports the following custom ```helm``` command.

## Custom helm commands

```
helm diff-releases WHAT [--code] --release1 RELEASE1 --revision1 R1 [--namespace1 NAMESPACE1] --release2 RELEASE2 --revision2 R2 [--namespace2 NAMESPACE2]
```

where WHAT is:

comma separated (no space before or after commas) set of some of these options hooks, manifest, notes, values, templates

--code option specifies to use VSCode to show the diff

## Building

```
npm install
npm run pkg
```

## Install it locally

NOTE: You may have to run the following command as administrator on windows.

```
cd dist
helm plugin install .
```

- Invoke the plugin as shown above.


