#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SecurityAuditor {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.passed = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✅';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  addIssue(severity, category, message, file = null, line = null) {
    this.issues.push({ severity, category, message, file, line });
    this.log(`${severity.toUpperCase()}: ${category} - ${message}`, 'error');
  }

  addWarning(category, message, file = null, line = null) {
    this.warnings.push({ category, message, file, line });
    this.log(`WARNING: ${category} - ${message}`, 'warning');
  }

  addPassed(category, message) {
    this.passed.push({ category, message });
    this.log(`PASSED: ${category} - ${message}`);
  }

  // Check for hardcoded secrets
  checkHardcodedSecrets() {
    this.log('Checking for hardcoded secrets...');
    
    const sensitivePatterns = [
      /private.*key.*=.*['"`][^'"`]{20,}['"`]/gi,
      /secret.*=.*['"`][^'"`]{10,}['"`]/gi,
      /password.*=.*['"`][^'"`]{5,}['"`]/gi,
      /api.*key.*=.*['"`][^'"`]{10,}['"`]/gi,
      /token.*=.*['"`][^'"`]{10,}['"`]/gi,
    ];

    const files = this.getAllFiles('src', ['.ts', '.js']);
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        sensitivePatterns.forEach(pattern => {
          if (pattern.test(line)) {
            this.addIssue('HIGH', 'Hardcoded Secret', 
              `Potential hardcoded secret found: ${line.trim()}`, 
              file, index + 1);
          }
        });
      });
    });

    if (this.issues.filter(i => i.category === 'Hardcoded Secret').length === 0) {
      this.addPassed('Hardcoded Secrets', 'No hardcoded secrets found');
    }
  }

  // Check for SQL injection vulnerabilities
  checkSQLInjection() {
    this.log('Checking for SQL injection vulnerabilities...');
    
    const sqlPatterns = [
      /execute.*\+.*req\./gi,
      /query.*\+.*req\./gi,
      /sql.*\+.*req\./gi,
    ];

    const files = this.getAllFiles('src', ['.ts', '.js']);
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        sqlPatterns.forEach(pattern => {
          if (pattern.test(line)) {
            this.addIssue('CRITICAL', 'SQL Injection', 
              `Potential SQL injection: ${line.trim()}`, 
              file, index + 1);
          }
        });
      });
    });

    if (this.issues.filter(i => i.category === 'SQL Injection').length === 0) {
      this.addPassed('SQL Injection', 'No SQL injection vulnerabilities found');
    }
  }

  // Check for XSS vulnerabilities
  checkXSS() {
    this.log('Checking for XSS vulnerabilities...');
    
    const xssPatterns = [
      /innerHTML.*=.*req\./gi,
      /outerHTML.*=.*req\./gi,
      /document\.write.*req\./gi,
    ];

    const files = this.getAllFiles('src', ['.ts', '.js']);
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        xssPatterns.forEach(pattern => {
          if (pattern.test(line)) {
            this.addIssue('HIGH', 'XSS', 
              `Potential XSS vulnerability: ${line.trim()}`, 
              file, index + 1);
          }
        });
      });
    });

    if (this.issues.filter(i => i.category === 'XSS').length === 0) {
      this.addPassed('XSS', 'No XSS vulnerabilities found');
    }
  }

  // Check for insecure crypto usage
  checkCryptoUsage() {
    this.log('Checking for insecure crypto usage...');
    
    const insecurePatterns = [
      /crypto\.createHash\('md5'/gi,
      /crypto\.createHash\('sha1'/gi,
      /crypto\.createHash\('sha256'/gi, // SHA256 is fine, but check for salt
    ];

    const files = this.getAllFiles('src', ['.ts', '.js']);
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        if (line.includes('crypto.createHash') && !line.includes('salt')) {
          this.addWarning('Crypto', 
            `Hash function without salt: ${line.trim()}`, 
            file, index + 1);
        }
      });
    });

    this.addPassed('Crypto', 'Crypto usage reviewed');
  }

  // Check for dependency vulnerabilities
  async checkDependencies() {
    this.log('Checking for dependency vulnerabilities...');
    
    try {
      const auditResult = execSync('npm audit --json', { encoding: 'utf8' });
      const audit = JSON.parse(auditResult);
      
      if (audit.metadata.vulnerabilities) {
        Object.entries(audit.metadata.vulnerabilities).forEach(([severity, count]) => {
          if (count > 0) {
            this.addIssue(severity.toUpperCase(), 'Dependency Vulnerability', 
              `${count} ${severity} vulnerabilities found in dependencies`);
          }
        });
      } else {
        this.addPassed('Dependencies', 'No known vulnerabilities in dependencies');
      }
    } catch (error) {
      this.addWarning('Dependencies', 'Could not run npm audit');
    }
  }

  // Check for environment variable usage
  checkEnvironmentVariables() {
    this.log('Checking environment variable usage...');
    
    const requiredEnvVars = [
      'DATABASE_URL',
      'JWT_SECRET',
      'API_KEY_SECRET',
      'MASTER_SEED_PHRASE',
      'WEBHOOK_SECRET',
    ];

    const envExample = fs.readFileSync('.env.example', 'utf8');
    const envVars = envExample.split('\n')
      .filter(line => line.includes('='))
      .map(line => line.split('=')[0]);

    requiredEnvVars.forEach(required => {
      if (!envVars.includes(required)) {
        this.addIssue('MEDIUM', 'Environment Variables', 
          `Required environment variable not documented: ${required}`);
      }
    });

    this.addPassed('Environment Variables', 'Environment variables reviewed');
  }

  // Check for proper error handling
  checkErrorHandling() {
    this.log('Checking error handling...');
    
    const files = this.getAllFiles('src', ['.ts', '.js']);
    let hasProperErrorHandling = true;
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for try-catch blocks
      const tryCatchCount = (content.match(/try\s*{/g) || []).length;
      const catchCount = (content.match(/catch\s*\(/g) || []).length;
      
      if (tryCatchCount > 0 && tryCatchCount !== catchCount) {
        this.addWarning('Error Handling', 
          `Mismatched try-catch blocks in ${file}`);
        hasProperErrorHandling = false;
      }
    });

    if (hasProperErrorHandling) {
      this.addPassed('Error Handling', 'Proper error handling found');
    }
  }

  // Check for input validation
  checkInputValidation() {
    this.log('Checking input validation...');
    
    const validationPatterns = [
      /express-validator/gi,
      /joi\./gi,
      /validation/gi,
    ];

    const files = this.getAllFiles('src', ['.ts', '.js']);
    let hasValidation = false;
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      
      validationPatterns.forEach(pattern => {
        if (pattern.test(content)) {
          hasValidation = true;
        }
      });
    });

    if (hasValidation) {
      this.addPassed('Input Validation', 'Input validation found');
    } else {
      this.addWarning('Input Validation', 'No input validation found');
    }
  }

  // Check for rate limiting
  checkRateLimiting() {
    this.log('Checking rate limiting...');
    
    const rateLimitPatterns = [
      /express-rate-limit/gi,
      /rateLimit/gi,
    ];

    const files = this.getAllFiles('src', ['.ts', '.js']);
    let hasRateLimiting = false;
    
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      
      rateLimitPatterns.forEach(pattern => {
        if (pattern.test(content)) {
          hasRateLimiting = true;
        }
      });
    });

    if (hasRateLimiting) {
      this.addPassed('Rate Limiting', 'Rate limiting implemented');
    } else {
      this.addWarning('Rate Limiting', 'No rate limiting found');
    }
  }

  // Utility function to get all files
  getAllFiles(dir, extensions) {
    const files = [];
    
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(fullPath, extensions));
      } else if (extensions.some(ext => item.endsWith(ext))) {
        files.push(fullPath);
      }
    });
    
    return files;
  }

  // Generate security report
  generateReport() {
    this.log('Generating security report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.issues.length + this.warnings.length + this.passed.length,
        issues: this.issues.length,
        warnings: this.warnings.length,
        passed: this.passed.length,
      },
      issues: this.issues,
      warnings: this.warnings,
      passed: this.passed,
    };

    // Write report to file
    fs.writeFileSync('security-audit-report.json', JSON.stringify(report, null, 2));
    
    // Print summary
    console.log('\n📊 Security Audit Summary:');
    console.log(`✅ Passed: ${this.passed.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log(`❌ Issues: ${this.issues.length}`);
    
    if (this.issues.length > 0) {
      console.log('\n🚨 Critical Issues Found:');
      this.issues.filter(i => i.severity === 'CRITICAL').forEach(issue => {
        console.log(`  - ${issue.message} (${issue.file}:${issue.line})`);
      });
    }
    
    return report;
  }

  // Run all security checks
  async runAudit() {
    this.log('Starting security audit...');
    
    this.checkHardcodedSecrets();
    this.checkSQLInjection();
    this.checkXSS();
    this.checkCryptoUsage();
    await this.checkDependencies();
    this.checkEnvironmentVariables();
    this.checkErrorHandling();
    this.checkInputValidation();
    this.checkRateLimiting();
    
    const report = this.generateReport();
    
    // Exit with error code if critical issues found
    const criticalIssues = this.issues.filter(i => i.severity === 'CRITICAL').length;
    if (criticalIssues > 0) {
      process.exit(1);
    }
    
    return report;
  }
}

// Run the audit
if (require.main === module) {
  const auditor = new SecurityAuditor();
  auditor.runAudit().catch(console.error);
}

module.exports = SecurityAuditor; 