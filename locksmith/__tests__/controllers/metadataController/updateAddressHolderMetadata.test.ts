import request from 'supertest'
import * as sigUtil from 'eth-sig-util'
import * as ethJsUtil from 'ethereumjs-util'

import app = require('../../../src/app')
import Base64 = require('../../../src/utils/base64')

const keyHolder = [
  '0xAaAdEED4c0B861cB36f4cE006a9C90BA2E43fdc2',
  '0x6f7a54d6629b7416e17fc472b4003ae8ef18ef4c',
]
const lockAddress = '0x95de5F777A3e283bFf0c47374998E10D8A2183C7'
const privateKey = ethJsUtil.toBuffer(
  '0xfd8abdd241b9e7679e3ef88f05b31545816d6fbcaf11e86ebd5a57ba281ce229'
)

const mockOnChainLockOwnership = {
  owner: jest.fn(() => {
    return Promise.resolve(keyHolder[0])
  }),
}

const mockKeyHoldersByLock = {
  getKeyHoldingAddresses: jest.fn(() => {
    return Promise.resolve([keyHolder[0]])
  }),
}

jest.mock('../../../src/utils/lockData', () => {
  return function() {
    return mockOnChainLockOwnership
  }
})

jest.mock('../../../src/graphql/datasource/keyholdersByLock', () => ({
  __esModule: true,
  KeyHoldersByLock: jest.fn(() => {
    return mockKeyHoldersByLock
  }),
}))

function generateKeyTypedData(message: any) {
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
        { name: 'salt', type: 'bytes32' },
      ],
      KeyMetadata: [],
    },
    domain: {
      name: 'Unlock',
      version: '1',
    },
    primaryType: 'KeyMetadata',
    message,
  }
}

describe('updating address holder metadata', () => {
  it('stores the passed data', async () => {
    expect.assertions(1)
    const typedData = generateKeyTypedData({
      UserMetaData: {
        owner: keyHolder[0],
        data: {
          protected: {
            emailAddress: 'emailAddress@example.com',
          },
        },
      },
    })

    const sig = sigUtil.signTypedData(privateKey, {
      data: typedData,
      from: '',
    })

    const response = await request(app)
      .put(`/api/key/${lockAddress}/user/${keyHolder[0]}`)
      .set('Accept', 'json')
      .set('Authorization', `Bearer ${Base64.encode(sig)}`)
      .send(typedData)

    expect(response.status).toEqual(202)
  })

  it('should update existing data if it already exists', async () => {
    expect.assertions(1)

    const typedData = generateKeyTypedData({
      UserMetaData: {
        owner: keyHolder[0],
        data: {
          protected: {
            emailAddress: 'updatedEmailAddress@example.com',
          },
        },
      },
    })

    const sig = sigUtil.signTypedData(privateKey, {
      data: typedData,
      from: '',
    })

    const response = await request(app)
      .put(`/api/key/${lockAddress}/user/${keyHolder[0]}`)
      .set('Accept', 'json')
      .set('Authorization', `Bearer ${Base64.encode(sig)}`)
      .send(typedData)

    expect(response.status).toEqual(202)
  })

  describe('when an invalid signature is passed', () => {
    it('returns unauthorized', async () => {
      expect.assertions(1)

      const typedData = generateKeyTypedData({
        UserMetaData: {
          owner: keyHolder[0],
          protected: {
            data: {
              emailAddress: 'updatedEmailAddress@example.com',
            },
          },
        },
      })

      const sig = sigUtil.signTypedData(privateKey, {
        data: typedData,
        from: '',
      })

      const response = await request(app)
        .put(`/api/key/${lockAddress}/user/${keyHolder[1]}`)
        .set('Accept', 'json')
        .set('Authorization', `Bearer ${Base64.encode(sig)}`)
        .send(typedData)

      expect(response.status).toEqual(401)
    })
  })
})
