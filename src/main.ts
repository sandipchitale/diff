"use strict";

import minimist from 'minimist';
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as zlib from 'zlib';
import * as child_process from 'child_process';
import * as diff from 'diff';


(async () => {
    const diffUsage = `
The Kubernetes package manager custome commands:

diff WHAT [--code] --release1 RELEASE1 --revision1 R1 [--namespace1 NAMESPACE1] --release2 RELEASE2 --revision2 R2 [--namespace2 NAMESPACE2]

where WHAT is:

comma separated (no space before or after commas) set of some of these options all, hooks, manifest, notes, values, templates

--code option specifies to use VSCode to show the diff
`;

    let rest = process.argv.slice(2);
    let optsAndCommands = minimist(rest);
    if (optsAndCommands._.length === 1) {

        const code = optsAndCommands.code || false;

        // one of all, hooks, manifest, notes, values, templates
        const diffWhats = optsAndCommands._[0].trim().split(',').filter((s: string) => s.length > 0);

        const namespace1 = optsAndCommands.namespace1 || optsAndCommands.namespace;
        const namespace2 = optsAndCommands.namespace2 || optsAndCommands.namespace;

        const release1 = optsAndCommands.release1 || optsAndCommands.release;
        const release2 = optsAndCommands.release2 || optsAndCommands.release;

        // revsion not specified, get the latest revision
        let revision1 = optsAndCommands.revision1 || optsAndCommands.revision; // start with default
        if (!revision1) {
            const helmList = child_process.execSync(`helm list ${namespace1 ? `-n ${namespace1}` : ''} -o json`, {
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
        let revision2 = optsAndCommands.revision2 || optsAndCommands.revision; // start with default
        if (!revision2) {
            const helmList = child_process.execSync(`helm list ${namespace2 ? `-n ${namespace2}` : ''} -o json`, {
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
            const secretBuffer1 = child_process.execSync(`kubectl get secret ${secretName1} -o go-template="{{.data.release | base64decode }}" ${namespace1 ? `-n ${namespace1}` : ''}`, {
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
                console.error(`Could not find secret ${secretName1}`);
                return;
            }
                                                                                                 //
            const secretName2 = `sh.helm.release.v1.${release2}.v${revision2}`;
            const secretBuffer2 = child_process.execSync(`kubectl get secret ${secretName2} -o go-template="{{.data.release | base64decode }}" ${namespace2 ? `-n ${namespace2}` : ''}`, {
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
                console.error(`Could not find secret ${secretName2}`);
                return;
            }

            if (helmGetAllJSON1 && helmGetAllJSON2) {
                diffWhats.forEach(diffWhat => {
                    switch (diffWhat) {
                    case 'all':
                        break;
                    case 'hooks':
                        break;
                    case 'manifest':
                        break;
                    case 'notes':
                        break;
                    case 'values':
                        break;
                    case 'templates':
                        let templates1 = '';
                        helmGetAllJSON1.chart.templates.forEach((template: any) => {
                            const templateString = Buffer.from(template.data, 'base64').toString('utf-8');
                            templates1 += `\n---\n# Template: ${template.name}\n${templateString}`;
                        });
                        templates1 = templates1.split('\\n').join('\n');
                        templates1 = `# Templates for release1: ${release1} revision1: ${revision1} ${namespace1 ? ` in namespace1 ${namespace1}` : ' in current namespace'}\n${templates1}`;

                        let templates2 = '';
                        helmGetAllJSON2.chart.templates.forEach((template: any) => {
                            const templateString = Buffer.from(template.data, 'base64').toString('utf-8');
                            templates2 += `\n---\n# Template: ${template.name}\n${templateString}`;
                        });
                        templates2 = templates2.split('\\n').join('\n');
                        templates2 = `# Templates for release2: ${release2} revision2: ${revision2} ${namespace2 ? ` in namespace2 ${namespace2}` : ' in current namespace'}\n${templates2}`;

                        if (code) {
                            codeDiff(
                                path.join(os.tmpdir(), `L-diff-${diffWhat}-${namespace1 ? `${namespace1}-` : ''}${release1}-${revision1}.txt`),
                                templates1,
                                path.join(os.tmpdir(), `R-diff-${diffWhat}-${namespace2 ? `${namespace2}-` : ''}${release2}-${revision2}.txt`),
                                templates2
                            );
                        } else {
                            console.info(diff.createTwoFilesPatch('L', 'R',
                                templates1, templates2,
                                `diff-${diffWhat}-${namespace1 ? `${namespace1}-` : ''}${release1}-${revision1}.txt`,
                                `diff-${diffWhat}-${namespace2 ? `${namespace2}-` : ''}${release2}-${revision2}.txt`));
                        }
                        break;
                    }
                });
            }
        } catch (e) {
            console.error(e);
            return;
        }

        function codeDiff(filePathL: string, contentL: string, filePathR: string, contentR: string) {
            fs.writeFileSync(filePathL, contentL);
            fs.writeFileSync(filePathR, contentR);
            child_process.execSync(`code --diff ${filePathL} ${filePathR}`, {
                encoding: 'utf8'
            });
        }
    } else {
        console.info(diffUsage);
    }
})();
