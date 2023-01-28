"use strict";

import minimist from 'minimist';
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as zlib from 'zlib';
import * as child_process from 'child_process';
import * as diff from 'diff';

const YAML = require('json-to-pretty-yaml');

(async () => {
    const diffUsage = `
diff-releases (v0.0.23)

The Kubernetes package manager custome commands:

diff WHAT [--code] --release1 RELEASE1 --revision1 R1 [--namespace1 NAMESPACE1] --release2 RELEASE2 --revision2 R2 [--namespace2 NAMESPACE2]

where WHAT is:

comma separated (no space before or after commas) set of some of these options hooks, manifest, notes, values, templates

--code option specifies to use VSCode to show the diff

NOTE:

--namespaces to mean --namespace1 and --namespace2
--releases   to mean --release1   and --release2
--revisions  to mean -revision1   and --revision2
`;

    let rest = process.argv.slice(2);
    let optsAndCommands = minimist(rest);
    if (optsAndCommands._.length === 1) {

        const code = optsAndCommands.code || false;

        // one of hooks, manifest, notes, values, templates
        const diffWhats = optsAndCommands._[0].trim().split(',').filter((s: string) => s.length > 0);

        let namespace1 = optsAndCommands.namespace1 || optsAndCommands.namespaces;
        let namespace2 = optsAndCommands.namespace2 || optsAndCommands.namespaces;

        const release1 = optsAndCommands.release1 || optsAndCommands.releases;
        const release2 = optsAndCommands.release2 || optsAndCommands.releases;

        // revsion not specified, get the latest revision
        let revision1 = optsAndCommands.revision1 || optsAndCommands.revisions; // start with default
        if (!revision1) {
            const helmList = child_process.execSync(`helm list ${namespace1 ? `--namespace ${namespace1}` : ''} -o json`, {
                encoding: 'utf8'
            });
            try {
                const helmListJSON = JSON.parse(helmList) as any[];
                helmListJSON.forEach((releaseObject: any) => {
                    if (releaseObject.name === release1) {
                        revision1 = releaseObject.revision;
                    }
                });
                // use default revision 1
            } catch (e) {
                // use default revision 1
                revision1 = 1;
            }
        }

        // revsion not specified, get the latest revision
        let revision2 = optsAndCommands.revision2 || optsAndCommands.revisions; // start with default
        if (!revision2) {
            const helmList = child_process.execSync(`helm list ${namespace2 ? `--namespace ${namespace2}` : ''} -o json`, {
                encoding: 'utf8'
            });
            try {
                const helmListJSON = JSON.parse(helmList) as any[];
                helmListJSON.forEach((releaseObject: any) => {
                    if (releaseObject.name === release2) {
                        revision2 = releaseObject.revision;
                    }
                });
                // use default revision 1
            } catch (e) {
                // use default revision 1
                revision2 = 1;
            }
        }

        let helmGetAllJSON1: any;
        let helmGetAllJSON2: any;

        try {
            const secretName1 = `sh.helm.release.v1.${release1}.v${revision1}`;
            const secretBuffer1 = child_process.execSync(`kubectl get secret ${secretName1} ${namespace1 ? `--namespace ${namespace1}` : ''} -o go-template="{{.data.release | base64decode }}"`, {
                encoding: 'utf8'
            });
            if (secretBuffer1) {
                try {
                    const inflated = zlib.gunzipSync(Buffer.from(secretBuffer1, 'base64'));
                    try {
                        helmGetAllJSON1 = JSON.parse(inflated.toString('utf8'));
                    } catch (e) {
                    }
                } catch (e) {
                    console.error(e);
                    return;
                }
            } else {
                console.error(`Could not find secret ${secretName1} in namespace ${namespace1}`);
                return;
            }
                                                                                                 //
            const secretName2 = `sh.helm.release.v1.${release2}.v${revision2}`;
            const secretBuffer2 = child_process.execSync(`kubectl get secret ${secretName2} ${namespace2 ? `--namespace ${namespace2}` : ''} -o go-template="{{.data.release | base64decode }}"`, {
                encoding: 'utf8'
            });
            if (secretBuffer2) {
                try {
                    const inflated = zlib.gunzipSync(Buffer.from(secretBuffer2, 'base64'));
                    try {
                        helmGetAllJSON2 = JSON.parse(inflated.toString('utf8'));
                    } catch (e) {
                    }
                } catch (e) {
                    console.error(e);
                    return;
                }
            } else {
                console.error(`Could not find secret ${secretName2} in namespace ${namespace2}`);
                return;
            }

            if (helmGetAllJSON1 && helmGetAllJSON2) {

                let contentL = '';
                let contentR = '';

                if (diffWhats.includes('all') || diffWhats.includes('hooks')) {
                    contentL = '';
                    contentR = '';
                    helmGetAllJSON1.hooks.forEach((hook: any) => {
                        contentL += `\n# Source: ${hook.path}\n${hook.manifest}`;
                    });
                    contentL = `# hooks for release1: ${release1} revision1: ${revision1} ${namespace1 ? ` in namespace1 ${namespace1}` : ' in current namespace'}\n\n${contentL.split('\\n').join('\n')}`;
                    helmGetAllJSON1.hooks.forEach((hook: any) => {
                        contentR += `\n# Source: ${hook.path}\n${hook.manifest}`;
                    });
                    contentR = `# hooks for release2: ${release2} revision2: ${revision2} ${namespace2 ? ` in namespace2 ${namespace2}` : ' in current namespace'}\n\n${contentR.split('\\n').join('\n')}`;
                    doDiff(code, 'hooks', 'yaml', contentL, contentR);
                }
                if (diffWhats.includes('all') || diffWhats.includes('manifest')) {
                    contentL = `# manifest for release1: ${release1} revision1: ${revision1} ${namespace1 ? ` in namespace1 ${namespace1}` : ' in current namespace'}\n\n${helmGetAllJSON1.manifest.split('\\n').join('\n')}`;
                    contentR = `# manifest for release2: ${release2} revision2: ${revision2} ${namespace2 ? ` in namespace2 ${namespace2}` : ' in current namespace'}\n\n${helmGetAllJSON2.manifest.split('\\n').join('\n')}`;
                    doDiff(code, 'manifest', 'yaml', contentL, contentR);
                }
                if (diffWhats.includes('all') || diffWhats.includes('notes')) {
                    // filePathL += '.txt';
                    // filePathR += '.txt';
                    contentL = `# notes for release1: ${release1} revision1: ${revision1} ${namespace1 ? ` in namespace1 ${namespace1}` : ' in current namespace'}\n${helmGetAllJSON1.info.notes.split('\\n').join('\n')}`;
                    contentR = `# notes for release2: ${release2} revision2: ${revision2} ${namespace2 ? ` in namespace2 ${namespace2}` : ' in current namespace'}\n${helmGetAllJSON2.info.notes.split('\\n').join('\n')}`;
                    doDiff(code, 'notes', 'txt', contentL, contentR);

                }
                if (diffWhats.includes('all') || diffWhats.includes('values')) {
                    contentL += `# values for release1: ${release1} revision1: ${revision1} ${namespace1 ? ` in namespace1 ${namespace1}` : ' in current namespace'}\n---\n${YAML.stringify(helmGetAllJSON1.chart.values)}`;
                    contentR += `# values for release2: ${release2} revision2: ${revision2} ${namespace2 ? ` in namespace2 ${namespace2}` : ' in current namespace'}\n---\n${YAML.stringify(helmGetAllJSON2.chart.values)}`;
                    doDiff(code, 'values', 'yaml', contentL, contentR);

                }
                if (diffWhats.includes('all') || diffWhats.includes('templates')) {
                    contentL = '';
                    helmGetAllJSON1.chart.templates.forEach((template: any) => {
                        const templateString = Buffer.from(template.data, 'base64').toString('utf-8');
                        contentL += `\n---\n# Template: ${template.name}\n${templateString}`;
                    });
                    contentL = contentL.split('\\n').join('\n');
                    contentL = `# templates for release1: ${release1} revision1: ${revision1} ${namespace1 ? ` in namespace1 ${namespace1}` : ' in current namespace'}\n${contentL}`;

                    contentR = '';
                    helmGetAllJSON2.chart.templates.forEach((template: any) => {
                        const templateString = Buffer.from(template.data, 'base64').toString('utf-8');
                        contentR += `\n---\n# Template: ${template.name}\n${templateString}`;
                    });
                    contentR = contentR.split('\\n').join('\n');
                    contentR = `# templates for release2: ${release2} revision2: ${revision2} ${namespace2 ? ` in namespace2 ${namespace2}` : ' in current namespace'}\n${contentR}`;
                    doDiff(code, 'templates', 'yaml', contentL, contentR);
                }
            }
        } catch (e) {
            console.error(e);
            return;
        }

        function doDiff(code: boolean, diffWhat: string, ext: string, contentL: string, contentR: string) {
            let filePathL = path.join(os.tmpdir(), `L-diff-${diffWhat}-${namespace1 ? `${namespace1}-` : ''}${release1}-${revision1}.${ext}`);
            let filePathR = path.join(os.tmpdir(), `R-diff-${diffWhat}-${namespace2 ? `${namespace2}-` : ''}${release2}-${revision2}.${ext}`);
            if (code) {
                codeDiff(contentL, contentR, filePathL, filePathR);
            } else {
                console.info(diff.createTwoFilesPatch('L', 'R', contentL, contentR, filePathL, filePathR));
            }
        }

        function codeDiff(contentL: string, contentR: string, filePathL: string, filePathR: string) {
            fs.writeFileSync(filePathL, contentL);
            fs.writeFileSync(filePathR, contentR);
            child_process.execSync(`code --diff ${filePathL} ${filePathR}`, { encoding: 'utf8' });
        }
    } else {
        console.info(diffUsage);
    }
})();
