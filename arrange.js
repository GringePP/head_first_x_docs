const fs = require('fs')

const README_TITLE = '# head_first_x_docs\n'

/* HEAD example
---
title_cn: xxx
title_en: xxx
---
*/

const folders = fs.readdirSync('./')

const txt = folders
    .filter(item => !item.startsWith('.'))
    .filter(item => fs.lstatSync('./' + item).isDirectory())
    .map(item => handleFolder('.', item))
    .filter(item => item != null)
    .reduce((total, current) => {
        let content = '### ' + '[' + current.title + ']' + '(' + './' + current.title + ')' + '\n'
        return total
            + current.files.filter(file => file != null)
                .reduce((tot, cur) => {
                    return tot + '* ' + '[' + cur.names.cn + '(' + cur.names.en + ')' + ']' + '(' + cur.path + ')' + '\n'
                }, content)
    }, README_TITLE)

console.log(txt)

fs.writeFile('./README.md', txt)

function handleFolder(parent, folderName) {
    const unkown = {
        cn: "未知",
        en: "Unknown",
    }
    const fullPath = parent + '/' + folderName
    const files = fs.readdirSync(fullPath)
    const result = files.filter(item => item.indexOf('.md') != -1 || item.indexOf('.markdown') != -1)
        .map((item, idx) => {
            const path = fullPath + '/' + item;
            const file = fs.readFileSync(path);
            const lines = new String(file).split('---');
            if (lines.length <= 1) {
                return null;
            }
            const head = lines[1];
            if (head.indexOf('title_cn') == -1 && head.indexOf('title_en') == -1) {
                return null;
            }
            const headItems = head.split('\r\n');
            const initialHead = unkown;
            headItems.filter(v => v != '')
                .forEach(v => {
                    if (v.indexOf('title_cn') != -1) {
                        initialHead.cn = v.split(': ')[1];
                    } else if (v.indexOf('title_en') != -1) {
                        initialHead.en = v.split(': ')[1];
                    }
                });
            return {
                path,
                names: {
                    cn: initialHead.cn,
                    en: initialHead.en
                }
            }
        });
    if (result.length == 0) {
        return null;
    }
    return {
        title: folderName,
        files: result
    }
}
