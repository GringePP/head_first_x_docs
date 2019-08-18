const fs = require('fs')

const MAPPER_NAME = 'mapper.json'
const README_TITLE = '# head_first_x_docs\n'

const folders = fs.readdirSync('./')

const txt = folders
    .filter(item => !item.startsWith('.'))
    .filter(item => fs.lstatSync('./' + item).isDirectory())
    .map(item => handleFolder('.', item))
    .filter(item => item != null)
    .reduce((total, current) => {
        let content = '#### ' + '[' + current.title + ']' + '(' + './' + current.title + ')' + '\n'
        return total
            + current.files.reduce((tot, cur) => {
                return tot + '* ' + '[' + cur.names.cn + ']' + '(' + cur.path + ')' + '\n'
            }, content)
    }, README_TITLE)

console.log(txt)

fs.writeFile('./README.md', txt)

function handleFolder(parent, folderName) {
    const fullPath = parent + '/' + folderName
    const files = fs.readdirSync(fullPath)
    if (files.indexOf(MAPPER_NAME) == -1) {
        console.log('no mapper.json found in', fullPath)
        return null;
    }
    const fileMap = require(fullPath + '/' + MAPPER_NAME)
    const result = fileMap.filter((item, _) => files.indexOf(item.file) != -1)
        .map((item, _) => {
            return {
                names: item.names,
                path: fullPath + '/' + item.file
            }
        })
    if (result.length === 0) {
        return null
    }
    return {
        title: folderName,
        files: result
    }
}
