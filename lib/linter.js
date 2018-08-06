const walk = require('walk')
const fs = require('fs')
const path = require('path')
const htmlparser = require('htmlparser2')
const cheerio = require('cheerio')
const sassLint = require('sass-lint')
const Reporter = require('./reporter.js')

class Linter {
  constructor (options) {
    this.lintErrors = []
  }

  checkPaths (pathsToCheck) {
    pathsToCheck.forEach((pathToCheck) => {
      this.checkPath(pathToCheck)
    })
  }

  checkPath (arg) {
    const walker = walk.walk(arg, { followLinks: false })
    walker.on('file', this.walkerFileHandler.bind(this))
    walker.on('end', this.walkerEndHandler.bind(this))
  }

  walkerFileHandler (root, fileStat, next) {
    const filename = `${root}/${fileStat.name}`

    if (filename.substr(-3) !== 'vue') {
      return next()
    }

    fs.readFile(path.resolve(root, fileStat.name), (error, fileData) => {
      if (error) {
        return console.log(error)
      }

      const fileTemplates = this.extractFileTemplates(fileData)

      fileTemplates.forEach((template) => {
        let lines = template.content.split(/\r?\n/)
        const firstNonEmptyLine = getFirstNonEmptyLine(lines)
        if (firstNonEmptyLine) {
          const spaces = getLeadingSpacesCount(firstNonEmptyLine)
          if (spaces !== 0) {
            lines = lines.map(l => getLeadingSpacesCount(l) >= spaces ? l.slice(spaces) : l)
          } else if (firstNonEmptyLine[0] === '\t') {
            lines = lines.map(l => l[0] === '\t' ? l.slice(1) : l)
          }
        }

        const fileErrors = sassLint.lintText({
          text: lines.join('\n'),
          filename: filename,
          format: 'scss'
        })

        if (fileErrors.messages.length) {
          fileErrors.messages.forEach((message) => {
            message.line += template.lineOffset
          })
          this.lintErrors = this.lintErrors.concat(fileErrors)
        }
      })

      next()
    })
  }

  walkerEndHandler () {
    const reporter = new Reporter()
    reporter.report(this.lintErrors)
  }

  extractFileTemplates (fileData) {
    let templates = []

    const handler = new htmlparser.DefaultHandler((error, dom) => {
      if (error) {
        return console.log(error)
      }

      const $ = cheerio.load(dom)
      const template = $('style[lang="scss"]').text()

      if (template.length <= 0) {
        return
      }

      templates.push({
        content: template,
        lineOffset: this.getLineOffset(template, $.text())
      })
    })

    var parser = new htmlparser.Parser(handler)
    parser.parseComplete(fileData)
    return templates
  }

  getLineOffset (needle, haystack) {
    const targetPosition = haystack.indexOf(needle)
    const untilTargetPosition = haystack.substring(0, targetPosition)
    return untilTargetPosition.split(/\r?\n/).length - 1
  }
}

module.exports = Linter

function getLeadingSpacesCount (line) {
  for (let spaces = 0; spaces < line.length; ++spaces) {
    if (line[spaces] !== ' ') {
      return spaces
    }
  }
}

function getFirstNonEmptyLine (lines) {
  for (let line of lines) {
    if (line) {
      return line
    }
  }
}
