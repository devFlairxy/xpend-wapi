# Security Documentation

## Overview

This document outlines the security measures, best practices, and audit procedures implemented in the USDT Deposit Backend API.

## Security Features

### 1. Secure Key Storage

- **Encryption at Rest**: All private keys are encrypted using AES-256 encryption before storage
- **Master Key Derivation**: Master encryption key is derived from multiple environment variables
- **Secure Storage Service**: Dedicated service for handling sensitive cryptographic operations

```typescript
// Example: Encrypting wallet private keys
const secureStorage = SecureStorageService.getInstance();
const encrypted = secureStorage.encryptWalletKeys(walletInfo);
```

### 2. API Security

- **API Key Authentication**: All endpoints require valid API key in `X-API-Key` header
- **Rate Limiting**: Configurable rate limiting to prevent abuse
- **CORS Protection**: Configured CORS headers for production use
- **Helmet Security**: Security headers via Helmet middleware

### 3. Input Validation

- **Express Validator**: Request validation using express-validator
- **Joi Schema Validation**: Complex object validation
- **TypeScript Types**: Compile-time type checking

### 4. Error Handling

- **Structured Error Responses**: Consistent error response format
- **No Information Leakage**: Errors don't expose sensitive information
- **Logging**: All errors are logged for monitoring

### 5. Database Security

- **Prisma ORM**: SQL injection protection through parameterized queries
- **Connection Pooling**: Secure database connection management
- **Encrypted Storage**: Sensitive data encrypted before database storage

## Security Audit

### Automated Security Checks

Run the security audit script:

```bash
npm run security:audit
```

This script checks for:

- ✅ Hardcoded secrets
- ✅ SQL injection vulnerabilities
- ✅ XSS vulnerabilities
- ✅ Insecure crypto usage
- ✅ Dependency vulnerabilities
- ✅ Environment variable configuration
- ✅ Error handling patterns
- ✅ Input validation
- ✅ Rate limiting implementation

### Manual Security Review

#### Code Review Checklist

- [ ] No hardcoded secrets in source code
- [ ] All user inputs are validated
- [ ] Database queries use parameterized statements
- [ ] Error messages don't expose sensitive information
- [ ] Authentication is required for all sensitive endpoints
- [ ] Rate limiting is implemented
- [ ] CORS is properly configured
- [ ] Security headers are set
- [ ] Logging doesn't expose sensitive data

#### Environment Security

- [ ] All secrets are in environment variables
- [ ] Production secrets are different from development
- [ ] Database connection uses SSL
- [ ] API keys are rotated regularly
- [ ] Master seed phrase is securely stored

## Monitoring and Alerting

### Sentry Integration

- **Error Tracking**: Automatic error capture and reporting
- **Performance Monitoring**: Request/response timing
- **User Context**: User-specific error tracking
- **Breadcrumbs**: Detailed error context

### Custom Metrics

- Wallet generation count
- Deposit detection count
- Webhook delivery count
- Forward transaction count
- Error count
- Average response time

## Security Best Practices

### 1. Private Key Management

```typescript
// ✅ Good: Encrypt private keys before storage
const encrypted = secureStorage.encryptWalletKeys(walletInfo);

// ❌ Bad: Store private keys in plain text
const wallet = { privateKey: 'plain-text-key' };
```

### 2. API Key Validation

```typescript
// ✅ Good: Validate API key on all endpoints
app.use('/api', validateApiKey, routes);

// ❌ Bad: No authentication
app.use('/api', routes);
```

### 3. Input Validation

```typescript
// ✅ Good: Validate user input
const { userId } = req.body;
if (!userId || typeof userId !== 'string') {
  return res.status(400).json({ error: 'Invalid userId' });
}

// ❌ Bad: No validation
const { userId } = req.body;
```

### 4. Error Handling

```typescript
// ✅ Good: Structured error handling
try {
  const result = await service.operation();
  res.json({ success: true, data: result });
} catch (error) {
  logger.error('Operation failed', { error: error.message });
  res.status(500).json({ success: false, error: 'Internal error' });
}

// ❌ Bad: Exposing internal errors
} catch (error) {
  res.status(500).json({ error: error.stack });
}
```

## Security Headers

The application sets the following security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'`

## Rate Limiting

- **Window**: 15 minutes (900,000ms)
- **Max Requests**: 100 requests per window
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## CORS Configuration

```typescript
// Production CORS
const corsOptions = {
  origin: ['https://yourdomain.com'],
  credentials: true,
  optionsSuccessStatus: 200
};
```

## Dependency Security

### Regular Audits

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Security audit with custom script
npm run security:audit
```

### Pinned Dependencies

Critical security dependencies are pinned to specific versions:

- `helmet`: ^7.1.0
- `express-rate-limit`: ^7.1.5
- `crypto`: ^1.0.1

## Incident Response

### Security Incident Process

1. **Detection**: Automated monitoring via Sentry
2. **Assessment**: Evaluate severity and impact
3. **Containment**: Immediate response to limit damage
4. **Investigation**: Root cause analysis
5. **Recovery**: Restore normal operations
6. **Post-mortem**: Document lessons learned

### Contact Information

- **Security Team**: security@yourcompany.com
- **Emergency**: +1-XXX-XXX-XXXX
- **Bug Bounty**: https://yourcompany.com/security

## Compliance

### Data Protection

- **Encryption**: All sensitive data encrypted at rest
- **Access Control**: Role-based access control
- **Audit Logging**: All operations logged
- **Data Retention**: Configurable retention policies

### Blockchain Security

- **Multi-signature**: Support for multi-sig wallets
- **Cold Storage**: Master wallets in cold storage
- **Transaction Limits**: Configurable limits per transaction
- **Monitoring**: Real-time transaction monitoring

## Security Testing

### Automated Tests

```bash
# Run security tests
npm run test:security

# Run full test suite
npm run test:coverage
```

### Manual Testing

- [ ] API key validation
- [ ] Rate limiting
- [ ] Input validation
- [ ] Error handling
- [ ] CORS configuration
- [ ] Security headers

## Updates and Maintenance

### Security Updates

- **Monthly**: Dependency vulnerability scans
- **Quarterly**: Security audit reviews
- **Annually**: Penetration testing
- **As needed**: Security incident response

### Version Management

- **Major Updates**: Security review required
- **Minor Updates**: Automated testing
- **Patch Updates**: Automated deployment

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practices-security.html)
- [Prisma Security](https://www.prisma.io/docs/guides/security) 